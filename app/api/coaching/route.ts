import { ok, unauthorized } from '@/lib/auth'
import { getSession } from '@/lib/auth'
import { trainers, bestCalls, worstCalls, trainerBehavioral, coachingRecs } from '@/lib/mock-data'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  return ok({ trainers, bestCalls, worstCalls, trainerBehavioral, coachingRecs })
}
