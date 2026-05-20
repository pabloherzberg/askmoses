import { type NextRequest } from 'next/server'
import { forbidden, getActiveOrgContext, ok, unauthorized } from '@/lib/auth'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { createAdminClient } from '@/lib/supabase/admin'

interface RejectBody {
  orgScriptId?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/scripts/reject
//
//   Body: { orgScriptId: string }
//
//   Owner rejeita o pending da própria org. RPC reject_org_script faz dois
//   updates na mesma transação: marca pending como rejected + restaura o
//   previous_script_id (se existia) pra active. Retorna restored_script_id
//   pra UI mostrar "voltou pra v1.0".
export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const ctx = await getActiveOrgContext()
  if (!ctx) return unauthorized()
  if (ctx.isImpersonating) return forbidden()
  if (ctx.role !== 'owner') return forbidden()
  if (!ctx.activeOrgId) return forbidden()

  let body: RejectBody
  try {
    body = (await request.json()) as RejectBody
  } catch {
    return Response.json(
      { data: null, error: { message: 'Body inválido', code: 400 } },
      { status: 400 },
    )
  }

  const { orgScriptId } = body
  if (!orgScriptId || !UUID_RE.test(orgScriptId)) {
    return Response.json(
      { data: null, error: { message: 'orgScriptId inválido', code: 400 } },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('reject_org_script', {
    p_org_script_id: orgScriptId,
    p_org_id: ctx.activeOrgId,
  })

  if (error) {
    console.error('[scripts/reject] rpc failed:', error)
    return Response.json(
      { data: null, error: { message: 'Erro ao rejeitar script', code: 500 } },
      { status: 500 },
    )
  }

  // Colunas com prefixo out_ vêm do RETURNS TABLE (migration 053).
  const rows = (data ?? []) as Array<{
    out_id: string
    out_status: string
    out_script_id: string
    out_restored_script_id: string | null
  }>
  if (rows.length === 0) {
    return Response.json(
      { data: null, error: { message: 'Pending não encontrado ou já resolvido', code: 404 } },
      { status: 404 },
    )
  }

  return ok({
    orgScriptId: rows[0].out_id,
    scriptId: rows[0].out_script_id,
    status: rows[0].out_status,
    restoredScriptId: rows[0].out_restored_script_id,
  })
}
