import { type NextRequest } from 'next/server'
import { ok, unauthorized, forbidden } from '@/lib/auth'
import { getSession, getRole } from '@/lib/auth'
import { createCriterion, bulkReplaceCriteria } from '@/lib/services/rubric'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role === 'trainer') return forbidden()

  try {
    const body = await request.json() as { name: string; description?: string | null; sortOrder: number }
    const created = await createCriterion(body)
    return ok(created)
  } catch (err) {
    console.error(err)
    return Response.json(
      { data: null, error: { message: 'Erro ao criar critério', code: 500 } },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role === 'trainer') return forbidden()

  try {
    const body = await request.json() as {
      criteria: { name: string; description?: string | null; sortOrder: number }[]
    }
    const updated = await bulkReplaceCriteria(body.criteria)
    return ok(updated)
  } catch (err) {
    console.error(err)
    return Response.json(
      { data: null, error: { message: 'Erro ao atualizar critérios', code: 500 } },
      { status: 500 },
    )
  }
}
