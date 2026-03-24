import { getRole, unauthorized, forbidden, ok } from '@/lib/auth'
import { getTrainers, getTeamStats } from '@/lib/services/trainers.service'

export async function GET() {
  const role = await getRole()

  if (!role) return unauthorized()
  if (role === 'trainer') return forbidden()

  const [trainers, stats] = await Promise.all([getTrainers(), getTeamStats()])

  return ok({ trainers, stats })
}
