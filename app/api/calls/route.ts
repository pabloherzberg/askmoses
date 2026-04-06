import { type NextRequest } from 'next/server'
import { ok, unauthorized, forbidden, getSession, getRole, getTrainerDbId } from '@/lib/auth'
import { getCalls, createCall } from '@/lib/services/calls'
import type { CreateCallInput } from '@/lib/services/calls'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  const { searchParams } = request.nextUrl
  const callOutcome = searchParams.get('callOutcome') ?? undefined
  const rubricId = searchParams.get('rubricId') ?? undefined
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined
  const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : undefined

  // Trainer vê somente as próprias calls
  let trainerId: string | undefined
  if (role === 'trainer') {
    trainerId = (await getTrainerDbId()) ?? undefined
  } else {
    trainerId = searchParams.get('trainerId') ?? undefined
  }

  const data = await getCalls({ trainerId, callOutcome, rubricId, limit, offset })
  return ok(data)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role === 'trainer') return forbidden()

  const body = await request.json() as CreateCallInput
  const call = await createCall(body)
  return ok(call)
}
