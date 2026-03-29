import { type NextRequest } from 'next/server'
import { ok, unauthorized } from '@/lib/auth'
import { getSession } from '@/lib/auth'
import { getCalls } from '@/lib/services/calls'
import type { CallResult } from '@/lib/types'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const { searchParams } = request.nextUrl
  const trainerId = searchParams.get('trainerId') ?? undefined
  const result = (searchParams.get('result') as CallResult) ?? undefined

  const data = await getCalls({ trainerId, result })
  return ok(data)
}
