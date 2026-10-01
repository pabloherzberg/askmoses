/**
 * Crons do sync de Won por lead:
 *   GET /api/cron/sync-ghl-won           — dispatcher, uma invocação por org
 *   GET /api/cron/sync-ghl-won/[orgId]   — o sync de uma org
 *
 * Também confere o contrato que motivou a troca: a rota antiga (que baixava
 * todas as opportunities da location) saiu, e cada rota declara maxDuration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const { mockListOrgs, mockGetOrg, mockMarkAuth, mockSyncOrg, mockNotify } = vi.hoisted(() => ({
  mockListOrgs: vi.fn(),
  mockGetOrg: vi.fn(),
  mockMarkAuth: vi.fn(),
  mockSyncOrg: vi.fn(),
  mockNotify: vi.fn(),
}))

vi.mock('@/lib/db/organizations', () => ({
  dbListGhlEnabledOrgs: mockListOrgs,
  dbGetOrgGhlConfigByOrgId: mockGetOrg,
  dbMarkOrgGhlAuthError: mockMarkAuth,
}))
vi.mock('@/lib/services/ghl-won-sync', () => ({ syncOrgWon: mockSyncOrg }))
vi.mock('@/lib/services/pipeline-alerts', () => ({ notifyPipelineFailure: mockNotify }))

import { GET as dispatch } from '@/app/api/cron/sync-ghl-won/route'
import { GET as syncOrg } from '@/app/api/cron/sync-ghl-won/[orgId]/route'
import { GhlAuthError } from '@/lib/services/ghl-api'

const ROOT = resolve(__dirname, '..')
const req = (path: string, auth?: string) =>
  new NextRequest(`http://localhost${path}`, { headers: auth ? { authorization: auth } : {} })
const params = (orgId: string) => ({ params: Promise.resolve({ orgId }) })

const ORG = { orgId: 'org-1', orgName: 'Org', locationId: 'loc', accessToken: 'tok', webhookSecret: '', enabled: true }

describe('sync-ghl-won', () => {
  const originalEnv = process.env
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.resetAllMocks()
    process.env = { ...originalEnv, CRON_SECRET: 'segredo' }
    mockNotify.mockResolvedValue(undefined)
    mockMarkAuth.mockResolvedValue(undefined)
  })
  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
  })

  it('as duas rotas recusam sem o CRON_SECRET', async () => {
    expect((await dispatch(req('/api/cron/sync-ghl-won', 'Bearer errado'))).status).toBe(401)
    expect((await syncOrg(req('/api/cron/sync-ghl-won/org-1'), params('org-1'))).status).toBe(401)
  })

  it('dispatcher dispara uma invocação por org, com o segredo', async () => {
    mockListOrgs.mockResolvedValue([ORG, { ...ORG, orgId: 'org-2' }])
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ leadsChecked: 1 }), { status: 200 }))
    global.fetch = fetchMock as unknown as typeof fetch
    const res = await dispatch(req('/api/cron/sync-ghl-won', 'Bearer segredo'))
    const body = await res.json()
    expect(body).toMatchObject({ orgsDispatched: 2, failed: 0 })
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'http://localhost/api/cron/sync-ghl-won/org-1',
      'http://localhost/api/cron/sync-ghl-won/org-2',
    ])
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { authorization: 'Bearer segredo' } })
  })

  it('dispatcher reporta a org que falhou sem derrubar as outras', async () => {
    mockListOrgs.mockResolvedValue([ORG, { ...ORG, orgId: 'org-2' }])
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 })) as unknown as typeof fetch
    expect(await (await dispatch(req('/api/cron/sync-ghl-won', 'Bearer segredo'))).json())
      .toMatchObject({ orgsDispatched: 2, failed: 1 })
  })

  it('org sem GHL ativo → 404, não sincroniza', async () => {
    mockGetOrg.mockResolvedValue(null)
    const res = await syncOrg(req('/api/cron/sync-ghl-won/org-1', 'Bearer segredo'), params('org-1'))
    expect(res.status).toBe(404)
    expect(mockSyncOrg).not.toHaveBeenCalled()
  })

  it('sincroniza a org com orçamento abaixo do maxDuration', async () => {
    mockGetOrg.mockResolvedValue(ORG)
    mockSyncOrg.mockResolvedValue({ leadsChecked: 5, becameWon: 1, errors: 0, stoppedByBudget: false })
    const res = await syncOrg(req('/api/cron/sync-ghl-won/org-1', 'Bearer segredo'), params('org-1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ orgId: 'org-1', leadsChecked: 5, becameWon: 1 })
    expect(mockSyncOrg.mock.calls[0][1].budgetMs).toBeLessThan(300_000)
  })

  it('GhlAuthError marca a org e alerta', async () => {
    mockGetOrg.mockResolvedValue(ORG)
    mockSyncOrg.mockRejectedValue(new GhlAuthError(401, 'pit morto'))
    const res = await syncOrg(req('/api/cron/sync-ghl-won/org-1', 'Bearer segredo'), params('org-1'))
    expect(res.status).toBe(500)
    expect(mockMarkAuth).toHaveBeenCalledWith('org-1')
    expect(mockNotify).toHaveBeenCalledWith('webhook_failed', expect.objectContaining({ reason: 'ghl_auth_expired' }))
  })

  it('contrato: a varredura da location saiu; vercel.json aponta para a rota nova; maxDuration explícito', () => {
    expect(existsSync(resolve(ROOT, 'app/api/cron/sync-ghl-opportunities/route.ts'))).toBe(false)
    expect(readFileSync(resolve(ROOT, 'lib/services/ghl-api.ts'), 'utf8')).not.toContain('fetchOpportunitiesByStatus')
    const vercel = readFileSync(resolve(ROOT, 'vercel.json'), 'utf8')
    expect(vercel).toContain('/api/cron/sync-ghl-won')
    expect(vercel).not.toContain('sync-ghl-opportunities')
    for (const f of ['app/api/cron/sync-ghl-won/route.ts', 'app/api/cron/sync-ghl-won/[orgId]/route.ts']) {
      expect(readFileSync(resolve(ROOT, f), 'utf8')).toMatch(/export const maxDuration = 300/)
    }
  })
})
