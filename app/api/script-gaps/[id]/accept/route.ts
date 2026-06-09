import { type NextRequest } from 'next/server'
import { getActiveOrgContext, getSession, ok, requireOwnerWrite, unauthorized } from '@/lib/auth'
import { dbAcceptScriptGap } from '@/lib/db/script-gaps'

// POST /api/script-gaps/:id/accept
// Marca o gap como aceito (accepted_at = now). A reescrita do trecho do script
// é feita à parte pelo PATCH /api/scripts/:id (responsabilidade separada,
// chamado pelo modal de Accept Gap).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const ctx = await getActiveOrgContext()
  if (!ctx?.activeOrgId) {
    return Response.json(
      { data: null, error: { message: 'No active organization', code: 403 } },
      { status: 403 },
    )
  }

  const { id } = await params
  const gap = await dbAcceptScriptGap(id, ctx.activeOrgId)

  if (!gap) {
    return Response.json(
      { data: null, error: { message: 'Script gap not found', code: 404 } },
      { status: 404 },
    )
  }

  return ok(gap)
}
