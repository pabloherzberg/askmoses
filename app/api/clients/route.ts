import { getRole, unauthorized, forbidden, ok } from '@/lib/auth'
import { getClients, getGlobalMetrics } from '@/lib/services/clients.service'

export async function GET() {
  const role = await getRole()
  if (!role) return unauthorized()
  if (role !== 'admin') return forbidden()

  const [clients, metrics] = await Promise.all([getClients(), getGlobalMetrics()])
  return ok({ clients, metrics })
}
