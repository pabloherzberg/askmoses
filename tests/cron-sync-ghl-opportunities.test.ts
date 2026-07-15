/**
 * Teste de integração: GET /api/cron/sync-ghl-opportunities
 *
 * Verifica o cron de polling diário de opportunities do GHL — alternativa ao
 * webhook OpportunityStageChanged que não depende de nenhum workflow
 * configurado no GHL. Todos os módulos externos (DB, fetch do GHL) são
 * mockados via vi.mock/vi.stubGlobal para rodar sem infra real.
 *
 * Casos cobertos:
 *  1. 401 sem CRON_SECRET configurado / header errado
 *  2. Happy path — busca won+lost de cada org, chama dbUpdateGhlOpportunity
 *     pra cada opportunity com contactId+status válidos
 *  3. Opportunity sem contactId ou status é ignorada (não chama update)
 *  4. Paginação: startAfter/startAfterId encadeados corretamente
 *  5. GhlAuthError (401/403 da API GHL) marca a org e não derruba o cron
 *  6. Erro no dbUpdateGhlOpportunity de uma opportunity não aborta as demais
 *  7. Nenhuma org habilitada → 0 chamadas de fetch, resposta zerada
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockDbListGhlEnabledOrgs,
  mockDbUpdateGhlOpportunity,
  mockDbMarkOrgGhlAuthError,
  mockNotifyPipelineFailure,
} = vi.hoisted(() => ({
  mockDbListGhlEnabledOrgs: vi.fn(),
  mockDbUpdateGhlOpportunity: vi.fn(),
  mockDbMarkOrgGhlAuthError: vi.fn(),
  mockNotifyPipelineFailure: vi.fn(),
}))

vi.mock('@/lib/db/organizations', () => ({
  dbListGhlEnabledOrgs: mockDbListGhlEnabledOrgs,
  dbMarkOrgGhlAuthError: mockDbMarkOrgGhlAuthError,
}))

vi.mock('@/lib/db/calls', () => ({
  dbUpdateGhlOpportunity: mockDbUpdateGhlOpportunity,
}))

vi.mock('@/lib/services/pipeline-alerts', () => ({
  notifyPipelineFailure: mockNotifyPipelineFailure,
}))

// Importa APÓS os mocks estarem registrados
import { GET } from '@/app/api/cron/sync-ghl-opportunities/route'

function makeRequest(auth?: string): NextRequest {
  const headers = new Headers()
  if (auth !== undefined) headers.set('authorization', auth)
  return new NextRequest('http://localhost/api/cron/sync-ghl-opportunities', { headers })
}

function makeOrg(overrides: Record<string, unknown> = {}) {
  return {
    orgId: 'org-1',
    locationId: 'loc-1',
    accessToken: 'token-1',
    webhookSecret: 'secret-1',
    enabled: true,
    ...overrides,
  }
}

describe('GET /api/cron/sync-ghl-opportunities', () => {
  const originalEnv = process.env
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.resetAllMocks()
    process.env = { ...originalEnv, CRON_SECRET: 'test-cron-secret' }
    mockDbUpdateGhlOpportunity.mockResolvedValue(undefined)
    mockDbMarkOrgGhlAuthError.mockResolvedValue(undefined)
    mockNotifyPipelineFailure.mockResolvedValue(undefined)
  })

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
    vi.unstubAllGlobals()
  })

  it('retorna 401 se CRON_SECRET não está configurado no ambiente', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeRequest('Bearer whatever'))
    expect(res.status).toBe(401)
  })

  it('retorna 401 se o header Authorization não bate com CRON_SECRET', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('retorna 401 se o header Authorization está ausente', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('happy path: busca won+lost de cada org e atualiza cada opportunity válida', async () => {
    mockDbListGhlEnabledOrgs.mockResolvedValue([makeOrg()])

    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url)
      const status = u.searchParams.get('status')
      if (status === 'won') {
        return jsonResponse({
          opportunities: [
            { id: 'opp-1', contactId: 'contact-1', status: 'won' },
            { id: 'opp-2', contactId: 'contact-2', status: 'won' },
          ],
        })
      }
      // lost
      return jsonResponse({
        opportunities: [{ id: 'opp-3', contactId: 'contact-3', status: 'lost' }],
      })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      orgsScanned: 1,
      opportunitiesFound: 3,
      updated: 3,
      errored: 0,
    })

    expect(mockDbUpdateGhlOpportunity).toHaveBeenCalledTimes(3)
    expect(mockDbUpdateGhlOpportunity).toHaveBeenCalledWith('org-1', 'contact-1', 'opp-1', 'won')
    expect(mockDbUpdateGhlOpportunity).toHaveBeenCalledWith('org-1', 'contact-2', 'opp-2', 'won')
    expect(mockDbUpdateGhlOpportunity).toHaveBeenCalledWith('org-1', 'contact-3', 'opp-3', 'lost')

    // Uma chamada de fetch por status (won, lost) — sem paginação extra pois
    // cada batch veio menor que o limite de página.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('ignora opportunity sem contactId ou sem status (não chama update)', async () => {
    mockDbListGhlEnabledOrgs.mockResolvedValue([makeOrg()])

    global.fetch = vi.fn(async (url: string) => {
      const u = new URL(url)
      if (u.searchParams.get('status') === 'lost') return jsonResponse({ opportunities: [] })
      return jsonResponse({
        opportunities: [
          { id: 'opp-1', contactId: null, status: 'won' },
          { id: 'opp-2', contactId: 'contact-2', status: null },
          { id: 'opp-3', contactId: 'contact-3', status: 'won' },
        ],
      })
    }) as unknown as typeof fetch

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    const body = await res.json()

    expect(mockDbUpdateGhlOpportunity).toHaveBeenCalledTimes(1)
    expect(mockDbUpdateGhlOpportunity).toHaveBeenCalledWith('org-1', 'contact-3', 'opp-3', 'won')
    // opportunitiesFound conta tudo que veio da API, updated só o que passou no filtro.
    expect(body.opportunitiesFound).toBeGreaterThanOrEqual(3)
    expect(body.updated).toBe(1)
  })

  it('pagina via startAfter/startAfterId até a página vir incompleta', async () => {
    mockDbListGhlEnabledOrgs.mockResolvedValue([makeOrg()])

    let call = 0
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url)
      if (u.searchParams.get('status') === 'lost') {
        return jsonResponse({ opportunities: [] })
      }
      call += 1
      if (call === 1) {
        // Página cheia (100 itens) com cursor pra próxima página.
        const opportunities = Array.from({ length: 100 }, (_, i) => ({
          id: `opp-p1-${i}`,
          contactId: `contact-p1-${i}`,
          status: 'won',
        }))
        return jsonResponse({
          opportunities,
          meta: { startAfter: 123, startAfterId: 'cursor-1' },
        })
      }
      // Segunda página: confirma que o cursor foi propagado, e volta incompleta (fim).
      expect(u.searchParams.get('startAfter')).toBe('123')
      expect(u.searchParams.get('startAfterId')).toBe('cursor-1')
      return jsonResponse({
        opportunities: [{ id: 'opp-p2-0', contactId: 'contact-p2-0', status: 'won' }],
      })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.updated).toBe(101)
    // 2 páginas de 'won' + 1 chamada de 'lost' (que voltou vazia, sem paginar mais).
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('GhlAuthError (401 da API GHL) marca a org com erro de auth e segue pras outras orgs', async () => {
    mockDbListGhlEnabledOrgs.mockResolvedValue([
      makeOrg({ orgId: 'org-bad-token', locationId: 'loc-bad' }),
      makeOrg({ orgId: 'org-2', locationId: 'loc-2' }),
    ])

    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url)
      if (u.searchParams.get('location_id') === 'loc-bad') {
        return new Response('unauthorized', { status: 401 })
      }
      return jsonResponse({ opportunities: [] })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.orgsScanned).toBe(2)
    expect(body.errored).toBe(1)
    expect(mockDbMarkOrgGhlAuthError).toHaveBeenCalledWith('org-bad-token')
    expect(mockNotifyPipelineFailure).toHaveBeenCalledWith(
      'webhook_failed',
      expect.objectContaining({ orgId: 'org-bad-token', reason: 'ghl_auth_expired' }),
    )
  })

  it('erro no dbUpdateGhlOpportunity de UMA opportunity não aborta as demais', async () => {
    mockDbListGhlEnabledOrgs.mockResolvedValue([makeOrg()])
    mockDbUpdateGhlOpportunity
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(undefined)

    global.fetch = vi.fn(async (url: string) => {
      const u = new URL(url as string)
      if (u.searchParams.get('status') === 'lost') return jsonResponse({ opportunities: [] })
      return jsonResponse({
        opportunities: [
          { id: 'opp-1', contactId: 'contact-1', status: 'won' },
          { id: 'opp-2', contactId: 'contact-2', status: 'won' },
        ],
      })
    }) as unknown as typeof fetch

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mockDbUpdateGhlOpportunity).toHaveBeenCalledTimes(2)
    expect(body.updated).toBe(1)
    expect(body.errored).toBe(1)
  })

  it('nenhuma org habilitada → não faz fetch nenhum, resposta zerada', async () => {
    mockDbListGhlEnabledOrgs.mockResolvedValue([])
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    const body = await res.json()

    expect(body).toEqual({ orgsScanned: 0, opportunitiesFound: 0, updated: 0, errored: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
