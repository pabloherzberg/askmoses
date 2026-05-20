import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { dbUpdateRubric, type UpdateRubricInput } from '@/lib/db/rubric'
import type { Role } from '@/lib/types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  try {
    const { id } = await params
    const body = (await request.json()) as UpdateRubricInput
    
    // We only update the rubric directly. 
    // dbUpdateRubric does not check org limits, but since it's admin, they have global write access.
    const updated = await dbUpdateRubric(id, body)
    
    return ok(updated)
  } catch (err) {
    console.error('[admin/rubrics/[id]] PATCH failed', err)
    return Response.json(
      { data: null, error: { message: 'Erro ao atualizar rubric específica', code: 500 } },
      { status: 500 },
    )
  }
}
