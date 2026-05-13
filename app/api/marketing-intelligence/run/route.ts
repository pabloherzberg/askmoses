import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { forbidden, getSession, ok, requireOwnerWrite, unauthorized } from '@/lib/auth'
import { executeMarketingRun, NoClosedCallsError } from '@/lib/services/marketing-intelligence'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface RunBody {
  orgId?: string
}

// POST /api/marketing-intelligence/run
//   RUN NOW — restricted to AskMoses super-admins (TC-09). Owners read the
//   latest cached run via GET /api/marketing-intelligence; só Admin força
//   nova run.
//
//   Admin não-impersonado (operando do painel /admin): seleciona qual org
//   rodar via body.orgId (admin não tem active_org_id próprio). Admin
//   impersonando é bloqueado por requireOwnerWrite (read-only).
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  // Admin impersonando é read-only.
  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  // Super-admin check é no JWT (app_metadata.role === 'admin').
  const isSuperAdmin = session.user.app_metadata?.role === 'admin'
  if (!isSuperAdmin) return forbidden()

  // Admin sem impersonate não tem active_org_id — orgId vem no body.
  let body: RunBody = {}
  try {
    body = (await request.json()) as RunBody
  } catch {
    // body opcional — segue sem orgId, vai cair em badRequest abaixo.
  }
  const orgId = body.orgId?.trim()
  if (!orgId || !UUID_RE.test(orgId)) {
    return Response.json(
      { data: null, error: { message: 'orgId é obrigatório', code: 400 } },
      { status: 400 },
    )
  }

  // Valida que a org existe antes de mandar pro service (que assume orgId válido).
  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .maybeSingle()
  if (!org) {
    return Response.json(
      { data: null, error: { message: 'Organização não encontrada', code: 404 } },
      { status: 404 },
    )
  }

  try {
    const data = await executeMarketingRun({
      orgId,
      trigger: 'manual',
      createdBy: session.user.id,
    })
    return ok(data)
  } catch (err) {
    if (err instanceof NoClosedCallsError) {
      return Response.json(
        {
          data: null,
          error: {
            message: err.message,
            code: 422,
            reason: 'NO_CLOSED_CALLS',
          },
        },
        { status: 422 },
      )
    }
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('[marketing-intelligence/run] POST failed:', message)
    return Response.json(
      { data: null, error: { message: 'Failed to run Marketing Intelligence analysis.', code: 500 } },
      { status: 500 },
    )
  }
}
