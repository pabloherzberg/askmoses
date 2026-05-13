import { type NextRequest } from 'next/server'
import { ok, unauthorized, forbidden } from '@/lib/auth'
import { getSession, getRole, requireOwnerWrite } from '@/lib/auth'
import { getRubric, getRubricConfig, updateRubricConfig } from '@/lib/services/rubric'
import type { UpdateRubricInput } from '@/lib/db/rubric'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const { searchParams } = request.nextUrl
  const configOnly = searchParams.get('config') === 'true'

  if (configOnly) {
    const data = await getRubricConfig()
    return ok(data)
  }

  const data = await getRubric()
  return ok(data)
}

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const role = await getRole()
  if (role === 'trainer') return forbidden()

  try {
    const body = (await request.json()) as UpdateRubricInput
    const updated = await updateRubricConfig(body)
    return ok(updated)
  } catch (err) {
    console.error(err)
    return Response.json(
      { data: null, error: { message: 'Erro ao atualizar rubric', code: 500 } },
      { status: 500 },
    )
  }
}
