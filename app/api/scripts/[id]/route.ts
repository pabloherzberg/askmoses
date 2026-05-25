import { type NextRequest } from 'next/server'
import { ok, unauthorized, getActiveOrgContext } from '@/lib/auth'
import { getSession, requireOwnerWrite } from '@/lib/auth'
import { dbGetScriptById, dbUpdateScript, dbDeleteScript, type ScriptSection } from '@/lib/db/scripts'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getActiveOrgContext()
  if (!ctx) return unauthorized()

  const { id } = await params

  // Scripts sugeridos pelo admin podem ter org_id diferente da org ativa —
  // buscamos sem filtro de org mas com autenticação garantida acima.
  const script = ctx.activeOrgId
    ? await dbGetScriptById(id, ctx.activeOrgId).catch(() => null)
      ?? await dbGetScriptById(id, '')   // fallback sem filtro org
    : await dbGetScriptById(id, '')

  if (!script) return Response.json({ data: null, error: { message: 'Script not found', code: 404 } }, { status: 404 })
  return ok(script)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const { id } = await params
  const body = await request.json() as Record<string, unknown>

  const updated = await dbUpdateScript(id, {
    name: body.name as string | undefined,
    description: body.description as string | undefined,
    sections: body.sections as ScriptSection[] | undefined,
    full_script: body.full_script as string | undefined,
    criteria: body.criteria as { name: string; description: string }[] | undefined,
    isActive: body.is_active as boolean | undefined,
  })

  return ok(updated)
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const { id } = await params
  await dbDeleteScript(id)
  return ok({ id, deleted: true })
}
