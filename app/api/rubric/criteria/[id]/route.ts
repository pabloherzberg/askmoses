import { type NextRequest } from 'next/server'
import { ok, unauthorized, forbidden } from '@/lib/auth'
import { getSession, getRole } from '@/lib/auth'
import { updateCriterion, deleteCriterion } from '@/lib/services/rubric'
import type { UpdateCriterionInput } from '@/lib/db/rubric'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role === 'trainer') return forbidden()

  try {
    const { id } = await params
    const body = (await request.json()) as UpdateCriterionInput
    const updated = await updateCriterion(id, body)
    return ok(updated)
  } catch (err) {
    console.error(err)
    return Response.json(
      { data: null, error: { message: 'Erro ao atualizar critério', code: 500 } },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role === 'trainer') return forbidden()

  try {
    const { id } = await params
    await deleteCriterion(id)
    return ok(null)
  } catch (err) {
    console.error(err)
    return Response.json(
      { data: null, error: { message: 'Erro ao deletar critério', code: 500 } },
      { status: 500 },
    )
  }
}
