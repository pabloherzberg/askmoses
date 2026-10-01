/**
 * Sync de Won por lead (migration 125) — regras em TypeScript.
 *
 *  1. resolveLeadFromOpportunities: qualquer won vence; won mais recente dá a data
 *  2. fetchContactOpportunities: filtra por contact_id, retry em 429, auth, e
 *     aborta se o GHL devolver opportunity de outro contato
 *  3. syncOrgWon: para no orçamento de tempo, GhlAuthError derruba a org,
 *     erro de um lead não derruba os outros
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockApply, mockListLeads } = vi.hoisted(() => ({
  mockApply: vi.fn(),
  mockListLeads: vi.fn(),
}))

vi.mock('@/lib/db/ghl-leads', () => ({
  dbApplyGhlLeadStatus: mockApply,
  dbListLeadsToRevisit: mockListLeads,
}))

import { resolveLeadFromOpportunities, syncOrgWon } from '@/lib/services/ghl-won-sync'
import { fetchContactOpportunities, GhlAuthError, type GhlOpportunity } from '@/lib/services/ghl-api'

const opp = (o: Partial<GhlOpportunity>): GhlOpportunity => ({
  id: 'o', contactId: 'c1', status: 'open', pipelineId: 'p', pipelineStageId: 's',
  lastStatusChangeAt: null, updatedAt: null, ...o,
})

describe('resolveLeadFromOpportunities', () => {
  it('won em qualquer pipeline vence lost — a ordem das opportunities não importa', () => {
    const r = resolveLeadFromOpportunities([
      opp({ id: 'L', status: 'lost', lastStatusChangeAt: '2026-09-20T00:00:00Z' }),
      opp({ id: 'W', status: 'won', pipelineId: 'daycare', lastStatusChangeAt: '2026-09-01T00:00:00Z' }),
    ])
    expect(r).toMatchObject({ ghlStatus: 'won', opportunityId: 'W', pipelineId: 'daycare', wonAt: '2026-09-01T00:00:00Z' })
  })

  it('dois won: a data é a do mais recente', () => {
    const r = resolveLeadFromOpportunities([
      opp({ id: 'A', status: 'won', lastStatusChangeAt: '2023-03-09T19:26:39Z' }),
      opp({ id: 'B', status: 'Won', lastStatusChangeAt: '2026-09-30T20:13:52Z' }),
    ])
    expect([r.opportunityId, r.wonAt]).toEqual(['B', '2026-09-30T20:13:52Z'])
  })

  it('sem lastStatusChangeAt usa updatedAt', () => {
    expect(resolveLeadFromOpportunities([opp({ status: 'won', updatedAt: '2026-09-02T00:00:00Z' })]).wonAt)
      .toBe('2026-09-02T00:00:00Z')
  })

  it('sem won: lost > open > abandoned > none', () => {
    expect(resolveLeadFromOpportunities([opp({ status: 'open' }), opp({ status: 'lost' })]).ghlStatus).toBe('lost')
    expect(resolveLeadFromOpportunities([opp({ status: 'abandoned' }), opp({ status: 'open' })]).ghlStatus).toBe('open')
    expect(resolveLeadFromOpportunities([opp({ status: 'abandoned' })]).ghlStatus).toBe('abandoned')
    expect(resolveLeadFromOpportunities([])).toMatchObject({ ghlStatus: 'none', wonAt: null })
  })
})

describe('fetchContactOpportunities', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers })

  it('consulta só o contato pedido (contact_id na query)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ opportunities: [{ id: 'o1', contactId: 'c1', status: 'won' }] }))
    global.fetch = fetchMock as unknown as typeof fetch
    const r = await fetchContactOpportunities('loc', 'tok', 'c1')
    expect(r.map((o) => o.id)).toEqual(['o1'])
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/opportunities/search')
    expect(url.searchParams.get('contact_id')).toBe('c1')
    expect(url.searchParams.get('location_id')).toBe('loc')
    expect(url.searchParams.has('status')).toBe(false)
  })

  it('429: espera o Retry-After e tenta de novo', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({}, 429, { 'retry-after': '0.001' }))
      .mockResolvedValueOnce(json({ opportunities: [] }))
    global.fetch = fetchMock as unknown as typeof fetch
    await expect(fetchContactOpportunities('loc', 'tok', 'c1')).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('401 → GhlAuthError', async () => {
    global.fetch = vi.fn().mockResolvedValue(json({ msg: 'no' }, 401)) as unknown as typeof fetch
    await expect(fetchContactOpportunities('loc', 'tok', 'c1')).rejects.toBeInstanceOf(GhlAuthError)
  })

  it('GHL ignorou o filtro (opportunity de outro contato) → erro, nada é devolvido', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      json({ opportunities: [{ id: 'o9', contactId: 'outro', status: 'won' }] }),
    ) as unknown as typeof fetch
    await expect(fetchContactOpportunities('loc', 'tok', 'c1')).rejects.toThrow(/ignorou contact_id/)
  })
})

describe('syncOrgWon', () => {
  const originalFetch = global.fetch
  const org = { orgId: 'org-1', locationId: 'loc', accessToken: 'tok' }

  beforeEach(() => {
    vi.resetAllMocks()
    mockApply.mockImplementation(async (i: { ghlStatus: string }) => ({
      status: i.ghlStatus, wonAt: null, divergence: null, callsUpdated: 1, stage2Removed: 0, stage2Marked: null,
    }))
  })
  afterEach(() => { global.fetch = originalFetch })

  const ghlReturns = (statusByContact: Record<string, string | number>) => {
    global.fetch = vi.fn(async (url: string) => {
      const cid = new URL(url).searchParams.get('contact_id')!
      const s = statusByContact[cid]
      if (typeof s === 'number') return new Response('{}', { status: s })
      return new Response(JSON.stringify({ opportunities: [{ id: `o-${cid}`, contactId: cid, status: s }] }))
    }) as unknown as typeof fetch
  }

  it('grava cada lead e conta quem virou won', async () => {
    mockListLeads.mockResolvedValue(['a', 'b', 'c'])
    ghlReturns({ a: 'won', b: 'lost', c: 'open' })
    const r = await syncOrgWon(org, { budgetMs: 60_000 })
    expect(r).toEqual({ leadsChecked: 3, becameWon: 1, errors: 0, stoppedByBudget: false })
    expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({ contactId: 'a', ghlStatus: 'won', source: 'sync' }))
  })

  it('erro de um lead não derruba os outros', async () => {
    mockListLeads.mockResolvedValue(['a', 'b'])
    ghlReturns({ a: 400, b: 'won' })
    const r = await syncOrgWon(org, { budgetMs: 60_000, concurrency: 1 })
    expect([r.leadsChecked, r.errors]).toEqual([1, 1])
  })

  it('para no orçamento de tempo e avisa', async () => {
    mockListLeads.mockResolvedValue(['a', 'b', 'c', 'd'])
    ghlReturns({ a: 'open', b: 'open', c: 'open', d: 'open' })
    let t = 0
    const now = () => t
    mockApply.mockImplementation(async () => {
      t += 100 // cada lead "custa" 100ms
      return { status: 'open', wonAt: null, divergence: null, callsUpdated: 0, stage2Removed: 0, stage2Marked: null }
    })
    const r = await syncOrgWon(org, { budgetMs: 250, concurrency: 1, now })
    expect(r.stoppedByBudget).toBe(true)
    expect(r.leadsChecked).toBe(3)
  })

  it('GhlAuthError derruba a org (PIT morto vale para todos)', async () => {
    mockListLeads.mockResolvedValue(['a', 'b'])
    ghlReturns({ a: 401, b: 401 })
    await expect(syncOrgWon(org, { budgetMs: 60_000 })).rejects.toBeInstanceOf(GhlAuthError)
  })
})
