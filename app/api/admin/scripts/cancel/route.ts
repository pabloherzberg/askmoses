import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSameOrigin } from '@/lib/auth/csrf'
import type { Role } from '@/lib/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/admin/scripts/cancel-analysis
//
//   Body: { orgScriptId: string }
//
//   Cancela a análise de IA de um pending: remove a entrada do
//   script_intelligence_cache. O script continua pending e vai para o
//   owner sem análise comparativa (analysisStatus = null).
//   Admin only.
export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  let body: { orgScriptId?: string }
  try {
    body = (await request.json()) as { orgScriptId?: string }
  } catch {
    return Response.json({ data: null, error: { message: 'Body inválido', code: 400 } }, { status: 400 })
  }

  const { orgScriptId } = body
  if (!orgScriptId || !UUID_RE.test(orgScriptId)) {
    return Response.json({ data: null, error: { message: 'orgScriptId inválido', code: 400 } }, { status: 400 })
  }

  const admin = createAdminClient()

  const { error } = await admin
    .from('script_intelligence_cache')
    .delete()
    .eq('org_script_id', orgScriptId)

  if (error) {
    return Response.json({ data: null, error: { message: 'Erro ao cancelar análise', code: 500 } }, { status: 500 })
  }

  return ok({ cancelled: true, orgScriptId })
}
