/**
 * POST /api/sync-trainers — só admin.
 *
 * A rota recalcula o cache de todos os trainers de todas as orgs com
 * service_role. O middleware exclui /api do matcher, então a checagem precisa
 * estar na própria rota: sem sessão → 401, owner/trainer → 403, admin → roda.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const auth = vi.hoisted(() => ({
  session: null as unknown,
  role: null as string | null,
}))
const syncTrainerStats = vi.hoisted(() => vi.fn(async () => {}))
const from = vi.hoisted(() =>
  vi.fn(() => ({ select: async () => ({ data: [{ id: 't1' }, { id: 't2' }], error: null }) })),
)

vi.mock('@/lib/auth', async () => {
  const json = (status: number, message: string) =>
    Response.json({ data: null, error: { message, code: status } }, { status })
  return {
    getSession: async () => auth.session,
    getRole: async () => auth.role,
    ok: (data: unknown) => Response.json({ data, error: null }),
    unauthorized: () => json(401, 'Não autenticado'),
    forbidden: () => json(403, 'Acesso não autorizado'),
  }
})
vi.mock('@/lib/db/trainers', () => ({ syncTrainerStats }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))

import { POST } from '@/app/api/sync-trainers/route'

function request(origin = 'https://app.askmoses.ai') {
  return new Request('https://app.askmoses.ai/api/sync-trainers', {
    method: 'POST',
    headers: { host: 'app.askmoses.ai', origin },
  }) as unknown as Parameters<typeof POST>[0]
}

beforeEach(() => {
  auth.session = null
  auth.role = null
  syncTrainerStats.mockClear()
  from.mockClear()
})

describe('POST /api/sync-trainers — autorização', () => {
  it('sem sessão → 401 e nada roda', async () => {
    const res = await POST(request())
    expect(res.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
    expect(syncTrainerStats).not.toHaveBeenCalled()
  })

  it.each(['owner', 'trainer'])('%s → 403 e nada roda', async (role) => {
    auth.session = { user: { id: 'u1' } }
    auth.role = role
    const res = await POST(request())
    expect(res.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
    expect(syncTrainerStats).not.toHaveBeenCalled()
  })

  it('sessão sem papel resolvido → 403', async () => {
    auth.session = { user: { id: 'u1' } }
    auth.role = null
    expect((await POST(request())).status).toBe(403)
    expect(syncTrainerStats).not.toHaveBeenCalled()
  })

  it('admin → sincroniza todos os trainers e responde { synced, failed, total }', async () => {
    auth.session = { user: { id: 'admin' } }
    auth.role = 'admin'
    const res = await POST(request())
    expect(res.status).toBe(200)
    expect(syncTrainerStats).toHaveBeenCalledTimes(2)
    expect(await res.json()).toEqual({ data: { synced: 2, failed: 0, total: 2 }, error: null })
  })

  it('admin vindo de outra origem (CSRF) → 403 antes de tudo', async () => {
    auth.session = { user: { id: 'admin' } }
    auth.role = 'admin'
    const res = await POST(request('https://evil.example'))
    expect(res.status).toBe(403)
    expect(syncTrainerStats).not.toHaveBeenCalled()
  })
})

describe('contrato no fonte da rota', () => {
  const s = readFileSync(join(process.cwd(), 'app/api/sync-trainers/route.ts'), 'utf8')

  it('checa sessão e papel admin ANTES de criar o client service_role', () => {
    const sessionIdx = s.indexOf('if (!session) return unauthorized()')
    const roleIdx = s.indexOf("if (role !== 'admin') return forbidden()")
    const adminClientIdx = s.indexOf('createAdminClient()', s.indexOf('export async function POST'))
    expect(sessionIdx).toBeGreaterThan(-1)
    expect(roleIdx).toBeGreaterThan(sessionIdx)
    expect(adminClientIdx).toBeGreaterThan(roleIdx)
  })

  it('não expõe outros métodos', () => {
    expect(s).not.toMatch(/export async function (GET|PUT|PATCH|DELETE)/)
  })
})
