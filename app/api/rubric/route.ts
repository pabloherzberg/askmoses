import { ok, unauthorized } from '@/lib/auth'
import { getSession } from '@/lib/auth'

const IS_DEV = process.env.NODE_ENV === 'development'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  if (IS_DEV) {
    const { rubricSections } = await import('@/lib/mock-data')
    return ok({ sections: rubricSections })
  }

  const { dbGetActiveRubricWithCriteria } = await import('@/lib/db/rubric')
  const result = await dbGetActiveRubricWithCriteria()
  if (!result) return ok({ rubric: null, criteria: [] })

  return ok(result)
}
