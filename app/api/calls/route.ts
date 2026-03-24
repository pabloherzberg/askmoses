import { type NextRequest } from 'next/server'
import { getRole, getUserId, unauthorized, forbidden, ok } from '@/lib/auth'
import { getCalls } from '@/lib/services/calls.service'
import type { Role, CallResult } from '@/lib/types'

export async function GET(request: NextRequest) {
  const role = await getRole()
  const userId = await getUserId()

  if (!role || !userId) return unauthorized()
  if (role !== 'trainer' && role !== 'owner' && role !== 'admin') return forbidden()

  const { searchParams } = request.nextUrl
  const filterTrainer = searchParams.get('trainerId')
  const filterResult = searchParams.get('result') as CallResult | null

  let data = await getCalls(role as Role, userId)

  if (filterTrainer) {
    data = data.filter((c) => c.trainerId === filterTrainer)
  }
  if (filterResult) {
    data = data.filter((c) => c.result === filterResult)
  }

  return ok(data)
}
