import { ok, unauthorized } from '@/lib/auth'
import { getSession } from '@/lib/auth'
import { getInsights } from '@/lib/services/insights'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const data = await getInsights()
  return ok(data)
}
