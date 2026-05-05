import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

interface SwitchBody {
  orgId?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(message: string) {
  return Response.json(
    { data: null, error: { message, code: 400 } },
    { status: 400 }
  )
}

function serverError(context: string, err?: unknown) {
  console.error(`[me/active-org] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 }
  )
}

// POST /api/me/active-org
//   Body: { orgId: uuid }
//   Troca a org ativa do user. Só aceita orgs onde ele tem membership
//   com invite_status='accepted'. RLS via current_org() passa a apontar
//   pra essa org no próximo request — frontend deve forçar refresh.
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  let body: SwitchBody
  try {
    body = (await request.json()) as SwitchBody
  } catch {
    return badRequest('Body inválido')
  }

  const orgId = body.orgId?.trim()
  if (!orgId || !UUID_RE.test(orgId)) return badRequest('orgId inválido')

  const admin = createAdminClient()

  const { data: membership, error: lookupErr } = await admin
    .from('memberships')
    .select('org_id, role, invite_status')
    .eq('user_id', session.user.id)
    .eq('org_id', orgId)
    .eq('invite_status', 'accepted')
    .maybeSingle()

  if (lookupErr) return serverError('Não foi possível validar a organização', lookupErr)
  if (!membership) return forbidden()

  const { error: updateErr } = await admin
    .from('users')
    .update({ active_org_id: orgId })
    .eq('id', session.user.id)

  if (updateErr) return serverError('Não foi possível trocar de organização', updateErr)

  // Sincroniza app_metadata.role com a role do membership na nova org. O
  // middleware roteia por JWT.role (rápido, sem DB hit), então sem isso um
  // user dual-role (owner em A, trainer em B) ficaria no path errado depois
  // do switch. Cliente precisa refreshSession() pra pegar o token novo.
  const currentMeta = (session.user.app_metadata ?? {}) as Record<string, unknown>
  const { error: metaErr } = await admin.auth.admin.updateUserById(session.user.id, {
    app_metadata: { ...currentMeta, role: membership.role },
  })
  if (metaErr) {
    console.error('[me/active-org] sync app_metadata.role falhou', metaErr)
    // Não bloqueia: a troca de org já foi gravada. O middleware pode rotear
    // errado até o próximo refresh. Cliente avisa se necessário.
  }

  return ok({ activeOrgId: orgId, role: membership.role })
}
