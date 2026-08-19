/**
 * TC — Won Rate: leads que compraram ÷ leads que agendaram avaliação
 *
 * Cobre a camada TypeScript. A regra de contagem em si (COUNT DISTINCT por
 * contact_id) vive no SQL e é testada por scripts/107_org_won_rate.test.sql —
 * este arquivo garante que a tradução linha-do-RPC → objeto não estraga o
 * número no caminho, e que a rota não vaza métrica de time pra trainer.
 *
 * Casos cobertos:
 *  1. Linha trainer_id NULL vira o total da org; as demais viram byTrainer
 *  2. Percentual arredondado, sem divisão por zero
 *  3. bigint do Postgres chegando como string vira number
 *  4. RPC vazio / erro
 *  5. Rota: 401 sem sessão, 403 pra trainer, zeros sem org, dado pra owner
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockRpc, mockGetSession, mockGetRole, mockGetOrgId, mockNotify } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetRole: vi.fn(),
  mockGetOrgId: vi.fn(),
  mockNotify: vi.fn(),
}))

vi.mock('@/lib/services/pipeline-alerts', () => ({
  notifyPipelineFailure: mockNotify,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mockRpc }),
}))

// ok/unauthorized/forbidden são reimplementados com o MESMO formato do
// lib/auth.ts real ({ data, error }) — mockar o módulo inteiro obriga a
// fornecê-los, e o teste checa o status HTTP que eles produzem.
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  getRole: mockGetRole,
  getOrgId: mockGetOrgId,
  ok: (data: unknown) => Response.json({ data, error: null }),
  unauthorized: () =>
    Response.json({ data: null, error: { message: 'Não autenticado', code: 401 } }, { status: 401 }),
  forbidden: () =>
    Response.json({ data: null, error: { message: 'Acesso não autorizado', code: 403 } }, { status: 403 }),
}))

// Importa APÓS os mocks estarem registrados
import { dbGetOrgWonRate } from '@/lib/db/calls'
import { GET } from '@/app/api/won-rate/route'
import { GET as CRON } from '@/app/api/cron/snapshot-weekly/route'

const ORG = '00000000-0000-0000-0000-0000000000aa'
const T1 = '00000000-0000-0000-0000-0000000000b1'
const T2 = '00000000-0000-0000-0000-0000000000b2'

function rpcReturns(rows: unknown[]) {
  mockRpc.mockResolvedValue({ data: rows, error: null })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Tradução linha do RPC → objeto ──────────────────────────────────────────

describe('dbGetOrgWonRate — mapeamento das linhas', () => {
  it('linha com trainer_id NULL vira o total da org, não uma entrada de byTrainer', async () => {
    rpcReturns([
      { trainer_id: null, closed_leads: 4, won_leads: 2 },
      { trainer_id: T1, closed_leads: 3, won_leads: 2 },
      { trainer_id: T2, closed_leads: 2, won_leads: 1 },
    ])

    const result = await dbGetOrgWonRate(ORG)

    expect(result.closedLeads).toBe(4)
    expect(result.wonLeads).toBe(2)
    expect(Object.keys(result.byTrainer)).toEqual([T1, T2])
    expect(result.byTrainer).not.toHaveProperty('null')
  })

  it('passa o org_id como p_org_id pro RPC', async () => {
    rpcReturns([{ trainer_id: null, closed_leads: 0, won_leads: 0 }])
    await dbGetOrgWonRate(ORG)
    expect(mockRpc).toHaveBeenCalledWith('org_won_rate', { p_org_id: ORG })
  })

  it('a soma dos vendedores PODE não bater com a org — lead atendido por dois conta em cada um', async () => {
    // Cenário real: 4 leads na org, mas T1(3) + T2(2) = 5. Não é bug —
    // é a razão de a org ter DISTINCT próprio em vez de somar no TS.
    rpcReturns([
      { trainer_id: null, closed_leads: 4, won_leads: 2 },
      { trainer_id: T1, closed_leads: 3, won_leads: 2 },
      { trainer_id: T2, closed_leads: 2, won_leads: 1 },
    ])

    const result = await dbGetOrgWonRate(ORG)
    const somaVendedores = Object.values(result.byTrainer).reduce((s, v) => s + v.closedLeads, 0)

    expect(somaVendedores).toBe(5)
    expect(result.closedLeads).toBe(4)
  })
})

// ─── Aritmética ──────────────────────────────────────────────────────────────

describe('dbGetOrgWonRate — cálculo do percentual', () => {
  it('arredonda pro inteiro mais próximo', async () => {
    rpcReturns([
      { trainer_id: null, closed_leads: 3, won_leads: 2 }, // 66.66 → 67
      { trainer_id: T1, closed_leads: 8, won_leads: 3 }, // 37.5  → 38
    ])

    const result = await dbGetOrgWonRate(ORG)

    expect(result.wonRate).toBe(67)
    expect(result.byTrainer[T1].wonRate).toBe(38)
  })

  it('denominador 0 → 0%, sem NaN nem divisão por zero', async () => {
    rpcReturns([{ trainer_id: null, closed_leads: 0, won_leads: 0 }])

    const result = await dbGetOrgWonRate(ORG)

    expect(result.wonRate).toBe(0)
    expect(Number.isNaN(result.wonRate)).toBe(false)
    // closedLeads é o que distingue "ninguém agendou" de "ninguém comprou" —
    // quem exibe precisa deste campo pra decidir entre "—" e "0%".
    expect(result.closedLeads).toBe(0)
  })

  it('todos os leads agendados compraram → 100% (não é bug, é o teto legítimo)', async () => {
    rpcReturns([{ trainer_id: null, closed_leads: 5, won_leads: 5 }])
    expect((await dbGetOrgWonRate(ORG)).wonRate).toBe(100)
  })

  it('bigint chegando como string do PostgREST vira number', async () => {
    rpcReturns([{ trainer_id: null, closed_leads: '40', won_leads: '10' }])

    const result = await dbGetOrgWonRate(ORG)

    expect(result.closedLeads).toBe(40)
    expect(result.wonLeads).toBe(10)
    expect(result.wonRate).toBe(25)
  })
})

// ─── Bordas do RPC ───────────────────────────────────────────────────────────

describe('dbGetOrgWonRate — respostas degeneradas', () => {
  it('data null (org sem nada) → zeros, não crash', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })

    const result = await dbGetOrgWonRate(ORG)

    expect(result).toEqual({ closedLeads: 0, wonLeads: 0, wonRate: 0, byTrainer: {} })
  })

  it('erro do RPC vira throw identificável (migration 107 não aplicada, por ex.)', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'function public.org_won_rate(uuid) does not exist' },
    })

    await expect(dbGetOrgWonRate(ORG)).rejects.toThrow(/dbGetOrgWonRate/)
  })
})

// ─── Rota GET /api/won-rate ──────────────────────────────────────────────────

describe('GET /api/won-rate — permissões', () => {
  it('sem sessão → 401', async () => {
    mockGetSession.mockResolvedValue(null)

    expect((await GET()).status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('trainer → 403: won rate é métrica do time inteiro', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetRole.mockResolvedValue('trainer')

    expect((await GET()).status).toBe(403)
    // A rota não pode nem consultar antes de barrar.
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it.each(['owner', 'admin'])('%s passa', async (role) => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetRole.mockResolvedValue(role)
    mockGetOrgId.mockResolvedValue(ORG)
    rpcReturns([
      { trainer_id: null, closed_leads: 4, won_leads: 2 },
      { trainer_id: T1, closed_leads: 3, won_leads: 2 },
    ])

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.error).toBeNull()
    expect(body.data.wonRate).toBe(50)
    expect(body.data.byTrainer[T1].wonRate).toBe(67)
  })

  it('owner sem org ativa → zeros e 200, não 404 (usuário recém convidado)', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetRole.mockResolvedValue('owner')
    mockGetOrgId.mockResolvedValue(null)

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ closedLeads: 0, wonLeads: 0, wonRate: 0, byTrainer: {} })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

// ─── Cron GET /api/cron/snapshot-weekly ──────────────────────────────────────

describe('GET /api/cron/snapshot-weekly', () => {
  const req = (auth?: string) => {
    const headers = new Headers()
    if (auth !== undefined) headers.set('authorization', auth)
    return new NextRequest('http://localhost/api/cron/snapshot-weekly', { headers })
  }

  beforeEach(() => {
    process.env.CRON_SECRET = 'segredo'
    // notifyPipelineFailure é async — o mock precisa devolver promise, senão
    // o `.catch` da rota quebra e o teste falha por motivo errado.
    mockNotify.mockResolvedValue(undefined)
  })

  it('sem header correto → 401 e não toca no banco', async () => {
    expect((await CRON(req())).status).toBe(401)
    expect((await CRON(req('Bearer errado'))).status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('sem CRON_SECRET configurado → 401 mesmo com header', async () => {
    delete process.env.CRON_SECRET
    expect((await CRON(req('Bearer '))).status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('autenticado: chama a função e reporta o que ela fez', async () => {
    mockRpc.mockResolvedValue({
      data: [{ since: '2026-03-01T00:00:00Z', weeks_dirty: 3, rows_written: 7 }],
      error: null,
    })

    const res = await CRON(req('Bearer segredo'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('stamp_call_stats_weekly')
    expect(body).toEqual({
      since: '2026-03-01T00:00:00Z',
      weeksDirty: 3,
      rowsWritten: 7,
    })
  })

  it('bigint como string do PostgREST vira number', async () => {
    mockRpc.mockResolvedValue({
      data: [{ since: null, weeks_dirty: '12', rows_written: '40' }],
      error: null,
    })
    const body = await (await CRON(req('Bearer segredo'))).json()
    expect([body.weeksDirty, body.rowsWritten]).toEqual([12, 40])
  })

  it('erro do banco → 500 e alerta, não falha silenciosa', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'function stamp_call_stats_weekly does not exist' },
    })

    const res = await CRON(req('Bearer segredo'))

    expect(res.status).toBe(500)
    // Falha silenciosa aqui é o pior caso: o número para de atualizar e
    // ninguém percebe.
    expect(mockNotify).toHaveBeenCalledWith('worker_failed', expect.objectContaining({
      callId: 'cron:snapshot-weekly',
    }))
  })
})

// ─── Invariante ──────────────────────────────────────────────────────────────

describe('Won Rate — invariante', () => {
  it('wonRate nunca passa de 100 quando o SQL respeita won <= closed', async () => {
    rpcReturns([
      { trainer_id: null, closed_leads: 10, won_leads: 10 },
      { trainer_id: T1, closed_leads: 1, won_leads: 1 },
      { trainer_id: T2, closed_leads: 7, won_leads: 0 },
    ])

    const result = await dbGetOrgWonRate(ORG)
    const todos = [result, ...Object.values(result.byTrainer)]

    for (const r of todos) {
      expect(r.wonLeads).toBeLessThanOrEqual(r.closedLeads)
      expect(r.wonRate).toBeGreaterThanOrEqual(0)
      expect(r.wonRate).toBeLessThanOrEqual(100)
    }
  })
})
