import { ok, unauthorized, notFound } from '@/lib/auth'
import { getSession } from '@/lib/auth'
import { getCallById } from '@/lib/services/calls'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return unauthorized()

  const { id } = await params
  const call = await getCallById(id)
  if (!call) return notFound('Call')

  return ok(call)
}
