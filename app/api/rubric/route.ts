import { getRole, unauthorized, ok } from '@/lib/auth'
import { getRubricSections, getTrendData } from '@/lib/services/rubric.service'

export async function GET() {
  const role = await getRole()
  if (!role) return unauthorized()

  const [sections, trend] = await Promise.all([getRubricSections(), getTrendData()])
  return ok({ sections, trend })
}
