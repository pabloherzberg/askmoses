import { getRole, getUserId, unauthorized, forbidden, notFound, ok } from '@/lib/auth'
import { getCallById } from '@/lib/services/calls.service'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getRole()
  const userId = await getUserId()

  if (!role || !userId) return unauthorized()

  const { id } = await params
  const call = await getCallById(id)

  if (!call) return notFound('Call')

  // Trainer só acessa calls próprias
  if (role === 'trainer' && call.trainerId !== userId) return forbidden()

  return ok(call)
}
