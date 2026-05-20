import { ok, unauthorized, forbidden } from '@/lib/auth'
import { getSession, getRole } from '@/lib/auth'
import { getClientsPage, getGlobalMetrics } from '@/lib/services/clients'

// GET /api/clients (legacy)
//   Mantido pra compat com MSW handlers/dev mocks. O painel /admin moderno
//   usa POST /api/admin/organizations/list (paginado/filtrado). Aqui retorna
//   primeira página com limit=200 — suficiente pra demos.
export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role !== 'admin') return forbidden()

  const [page, metrics] = await Promise.all([
    getClientsPage({ page: 1, limit: 200 }),
    getGlobalMetrics(),
  ])
  return ok({ clients: page.rows, metrics })
}
