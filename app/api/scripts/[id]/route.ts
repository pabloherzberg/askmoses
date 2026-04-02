import { type NextRequest } from 'next/server'
import { ok, unauthorized } from '@/lib/auth'
import { getSession } from '@/lib/auth'
import { dbUpdateScript, dbDeleteScript } from '@/lib/db/scripts'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()

  const { id } = await params
  const body = await request.json() as Record<string, unknown>

  const updated = await dbUpdateScript(id, {
    name: body.name as string | undefined,
    description: body.description as string | undefined,
    sections: body.sections as { name: string; instructions: string; tips: string }[] | undefined,
    full_script: body.full_script as string | undefined,
    criteria: body.criteria as { name: string; description: string }[] | undefined,
    isActive: body.is_active as boolean | undefined,
  })

  return ok(updated)
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()

  const { id } = await params
  await dbDeleteScript(id)
  return ok({ id, deleted: true })
}
