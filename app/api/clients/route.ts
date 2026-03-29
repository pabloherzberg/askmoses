import { ok, unauthorized, forbidden } from '@/lib/auth'
import { getSession, getRole } from '@/lib/auth'
import { getClients } from '@/lib/services/clients'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role !== 'admin') return forbidden()

  const data = await getClients()
  return ok(data)
}
