import { type NextRequest } from 'next/server'
import { forbidden, getActiveOrgContext, ok, unauthorized } from '@/lib/auth'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { createAdminClient } from '@/lib/supabase/admin'

interface AcceptBody {
  orgScriptId?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/scripts/accept
//
//   Body: { orgScriptId: string }
//
//   Owner aceita o pending da própria org. RPC accept_org_script faz o
//   UPDATE com WHERE org_id = sessão.activeOrgId — defesa cruzada contra
//   um owner aceitar pending de outra tenant via id direto.
//
//   Admin impersonando age como owner efetivo da org e também pode aceitar.
//   Trainer é barrado (role guard abaixo).
export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const ctx = await getActiveOrgContext()
  if (!ctx) return unauthorized()
  if (ctx.role !== 'owner' && !(ctx.role === 'admin' && ctx.isImpersonating)) return forbidden()
  if (!ctx.activeOrgId) return forbidden()

  let body: AcceptBody
  try {
    body = (await request.json()) as AcceptBody
  } catch {
    return Response.json(
      { data: null, error: { message: 'Body inválido', code: 400, reason: 'INVALID_BODY' } },
      { status: 400 },
    )
  }

  const { orgScriptId } = body
  if (!orgScriptId || !UUID_RE.test(orgScriptId)) {
    return Response.json(
      { data: null, error: { message: 'orgScriptId inválido', code: 400, reason: 'INVALID_ORG_SCRIPT_ID' } },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('accept_org_script', {
    p_org_script_id: orgScriptId,
    p_org_id: ctx.activeOrgId,
  })

  if (error) {
    console.error('[scripts/accept] rpc failed:', error)
    return Response.json(
      { data: null, error: { message: 'Erro ao aceitar script', code: 500, reason: 'RPC_FAILED' } },
      { status: 500 },
    )
  }

  // Colunas com prefixo out_ vêm do RETURNS TABLE (migration 053).
  const rows = (data ?? []) as Array<{ out_id: string; out_status: string; out_script_id: string }>
  if (rows.length === 0) {
    return Response.json(
      { data: null, error: { message: 'Pending não encontrado ou já resolvido', code: 404, reason: 'PENDING_NOT_FOUND' } },
      { status: 404 },
    )
  }

  return ok({ orgScriptId: rows[0].out_id, scriptId: rows[0].out_script_id, status: rows[0].out_status })
}
