import { ok, unauthorized } from '@/lib/auth'
import { getSession } from '@/lib/auth'
import { getRubric } from '@/lib/services/rubric'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const data = await getRubric()
  return ok(data)
}
