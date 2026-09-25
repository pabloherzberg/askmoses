/**
 * TC — dbUpdateGhlOpportunity (camada TS) + webhook de oportunidade
 *
 * A regra do Stage 2 vive no SQL e é testada por tc-stage2-won-sql. Aqui se
 * confere o que a função manda pro banco:
 *  1. won: grava ghl_won_at só nas calls que entram em won ou estão sem data
 *  2. won: o patch geral NÃO carrega ghl_won_at (não regrava a cada sync)
 *  3. won: usa lastStatusChangeAt do GHL quando válido; senão now()
 *  4. won: chama mark_stage2_paying_from_won
 *  5. não-won: zera ghl_won_at e não chama o RPC (não mexe no Stage 2)
 *  6. falha no RPC (erro devolvido OU exceção) não propaga: loga, alerta, segue
 *  7. webhook responde 200 com o status gravado mesmo com o RPC falhando
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

type Op = { table: string; patch: Record<string, unknown>; filters: string[] }

const { ops, mockRpc, mockNotify, mockGetOrgConfig } = vi.hoisted(() => ({
  ops: [] as Op[],
  mockRpc: vi.fn(),
  mockNotify: vi.fn(),
  mockGetOrgConfig: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => {
        const op: Op = { table, patch, filters: [] }
        ops.push(op)
        const builder = {
          eq: (col: string, val: unknown) => {
            op.filters.push(`eq:${col}=${String(val)}`)
            return builder
          },
          or: (expr: string) => {
            op.filters.push(`or:${expr}`)
            return builder
          },
          then: (resolve: (v: unknown) => unknown) => resolve({ error: null, count: 2 }),
        }
        return builder
      },
    }),
  }),
}))

vi.mock('@/lib/services/pipeline-alerts', () => ({
  notifyPipelineFailure: mockNotify,
}))

// Só o lookup da org é usado no caminho de oportunidade; o resto da rota
// (pipeline de call, trainers, agendamentos) fica inerte.
vi.mock('@/lib/db/organizations', () => ({
  dbGetOrgGhlConfigByLocation: mockGetOrgConfig,
}))
vi.mock('@/lib/services/ghl-call-pipeline', () => ({ processGhlCall: vi.fn() }))
vi.mock('@/lib/db/trainers', () => ({
  dbGetOrCreateFrontDeskTrainer: vi.fn(),
  dbResolveTrainerForGhlCall: vi.fn(),
}))
vi.mock('@/lib/db/appointments', () => ({ dbUpsertGhlAppointment: vi.fn() }))

import { dbUpdateGhlOpportunity } from '@/lib/db/calls'
import { POST } from '@/app/api/webhooks/ghl/route'

const NOW = '2026-09-25T10:00:00.000Z'

describe('dbUpdateGhlOpportunity', () => {
  beforeEach(() => {
    ops.length = 0
    mockRpc.mockReset()
    mockRpc.mockResolvedValue({ data: null, error: null })
    mockNotify.mockReset()
    mockNotify.mockResolvedValue(undefined)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('won: ghl_won_at condicional, patch geral sem ghl_won_at, e marca Stage 2', async () => {
    const count = await dbUpdateGhlOpportunity('org-1', 'c-1', 'opp-1', ' Won ')

    expect(count).toBe(2)
    expect(ops).toHaveLength(2)

    expect(ops[0].patch).toEqual({ ghl_won_at: NOW })
    expect(ops[0].filters).toEqual([
      'eq:org_id=org-1',
      'eq:contact_id=c-1',
      'or:ghl_won_at.is.null,ghl_won_status.is.null,ghl_won_status.neq.won',
    ])

    expect(ops[1].patch).toEqual({
      ghl_opportunity_id: 'opp-1',
      ghl_won_status: 'won',
      updated_at: NOW,
    })
    expect(ops[1].patch).not.toHaveProperty('ghl_won_at')

    expect(mockRpc).toHaveBeenCalledWith('mark_stage2_paying_from_won', {
      p_org_id: 'org-1',
      p_contact_id: 'c-1',
    })
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('won: usa a data de mudança de status do GHL quando válida', async () => {
    await dbUpdateGhlOpportunity('org-1', 'c-1', 'opp-1', 'won', '2026-09-20T14:30:00Z')
    expect(ops[0].patch).toEqual({ ghl_won_at: '2026-09-20T14:30:00.000Z' })
  })

  it('won: data inválida do GHL cai em now()', async () => {
    await dbUpdateGhlOpportunity('org-1', 'c-1', 'opp-1', 'won', 'não-é-data')
    expect(ops[0].patch).toEqual({ ghl_won_at: NOW })
  })

  it('não-won: zera ghl_won_at e não mexe no Stage 2', async () => {
    await dbUpdateGhlOpportunity('org-1', 'c-1', 'opp-1', 'lost', '2026-09-20T14:30:00Z')

    expect(ops).toHaveLength(1)
    expect(ops[0].patch).toEqual({
      ghl_opportunity_id: 'opp-1',
      ghl_won_status: 'lost',
      ghl_won_at: null,
      updated_at: NOW,
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('RPC devolve { error }: não propaga, loga e alerta', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } })

    await expect(dbUpdateGhlOpportunity('org-1', 'c-1', 'opp-1', 'won')).resolves.toBe(2)

    expect(console.error).toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalledTimes(1)
    const [status, ctx] = mockNotify.mock.calls[0]
    expect(status).toBe('webhook_failed')
    expect(ctx).toMatchObject({
      callId: 'sync-error:stage2:opp-1',
      orgId: 'org-1',
      contactId: 'c-1',
      stage: 'webhook',
      reason: 'db_error',
      meta: { operation: 'mark_stage2_paying_from_won', contactId: 'c-1', opportunityId: 'opp-1' },
    })
    expect(String(ctx.error)).toMatch(/function does not exist/)
  })

  it('RPC lança exceção (rede): não propaga, alerta', async () => {
    mockRpc.mockRejectedValue(new Error('fetch failed'))
    await expect(dbUpdateGhlOpportunity('org-1', 'c-1', 'opp-1', 'won')).resolves.toBe(2)
    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(String(mockNotify.mock.calls[0][1].error)).toMatch(/fetch failed/)
  })

  it('alerta que falha também não propaga', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    mockNotify.mockRejectedValue(new Error('slack down'))
    await expect(dbUpdateGhlOpportunity('org-1', 'c-1', 'opp-1', 'won')).resolves.toBe(2)
  })
})

describe('POST /api/webhooks/ghl — oportunidade won com RPC do Stage 2 falhando', () => {
  beforeEach(() => {
    ops.length = 0
    mockRpc.mockReset()
    mockNotify.mockReset()
    mockNotify.mockResolvedValue(undefined)
    mockGetOrgConfig.mockResolvedValue({
      orgId: 'org-1',
      orgName: 'Org Teste',
      webhookSecret: 'secret-1',
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('responde 200 com o status gravado', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } })

    const req = new NextRequest('http://localhost/api/webhooks/ghl', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ghl-location-id': 'loc-1',
        'x-askmoses-secret': 'secret-1',
      },
      body: JSON.stringify({
        customData: {
          type: 'OpportunityStatusChanged',
          opportunityId: 'opp-1',
          contactId: 'c-1',
          status: 'won',
        },
      }),
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      data: { opportunityId: 'opp-1', status: 'won', contactId: 'c-1', callsUpdated: 2 },
      error: null,
    })
    // O status foi gravado; a falha saiu só como alerta do Stage 2.
    expect(ops.map((o) => o.patch.ghl_won_status).filter(Boolean)).toEqual(['won'])
    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockNotify.mock.calls[0][1].callId).toBe('sync-error:stage2:opp-1')
  })
})
