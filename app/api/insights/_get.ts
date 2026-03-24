import { getRole, unauthorized, forbidden, ok } from '@/lib/auth'
import { getInsights } from '@/lib/services/insights.service'

export async function GET() {
  const role = await getRole()
  if (!role) return unauthorized()
  if (role === 'trainer') return forbidden()
  return ok(await getInsights())
}
