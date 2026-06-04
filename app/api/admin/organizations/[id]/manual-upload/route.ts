import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden, notFound } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { dbSetOrgManualUploadEnabled } from '@/lib/db/organizations'
import type { Role } from '@/lib/types'

interface PatchBody {
  enabled?: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(message: string) {
  return Response.json(
    { data: null, error: { message, code: 400 } },
    { status: 400 }
  )
}

function serverError(context: string, err?: unknown) {
  console.error(`[admin/organizations/manual-upload] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 }
  )
}

// PATCH /api/admin/organizations/[id]/manual-upload
//   Body: { enabled: boolean }
//
//   Liga/desliga a feature flag organizations.manual_upload_enabled.
//   Default no schema é false (GHL/Pepper é o canal padrão de ingestão);
//   Admin habilita manualmente quem ainda precisa do upload pela UI
//   (legado, demos, troubleshooting).
//
//   Enforcement nesta fase é frontend-only — sidebar esconde item e
//   /dashboard/upload redireciona pra /dashboard. API /api/analyze fica
//   aberta (decisão consciente; hardening em follow-up).
//
//   Admin only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  const { id: orgId } = await params
  if (!orgId || !UUID_RE.test(orgId)) return badRequest('orgId inválido')

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return badRequest('Body inválido')
  }

  if (typeof body.enabled !== 'boolean') {
    return badRequest('enabled deve ser boolean')
  }

  const admin = createAdminClient()
  const { data: existing, error: lookupErr } = await admin
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .maybeSingle()
  if (lookupErr) return serverError('Não foi possível validar a organização', lookupErr)
  if (!existing) return notFound('Organização')

  try {
    await dbSetOrgManualUploadEnabled(orgId, body.enabled)
  } catch (err) {
    return serverError('Não foi possível atualizar manual_upload_enabled', err)
  }

  return ok({ id: orgId, manualUploadEnabled: body.enabled })
}
