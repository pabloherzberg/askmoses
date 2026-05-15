import { type NextRequest } from 'next/server'
import { getActiveOrgContext, getSession, ok, unauthorized, forbidden, notFound, requireOwnerWrite } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInviteEmail } from '@/lib/email/send-invite'
import type { Role } from '@/lib/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ResendBody {
  locale?: string
}

function badRequest(message: string) {
  return Response.json({ data: null, error: { message, code: 400 } }, { status: 400 })
}

function serverError(context: string, err?: unknown) {
  console.error(`[invites:resend] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 }
  )
}

// POST /api/invites/[id]/resend?orgId=<uuid>
//   Owner: reenvia convite pendente da própria org ATIVA. orgId no query
//          é ignorado.
//   Admin: orgId é OBRIGATÓRIO no querystring (multi-org).
//   Trainer: 403.
//
// Diferente do POST /api/invites Branch B, este endpoint NÃO usa o token
// do auth do Supabase — usa nossa própria tabela invite_tokens (migration
// 034) via lib/email/send-invite. Resultado: reenviar pra (user, org_B)
// não invalida o link da org_A do mesmo email.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id || !UUID_RE.test(id)) return badRequest('Identificador inválido')

  const session = await getSession()
  if (!session) return unauthorized()

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const callerRole = session.user.app_metadata?.role as Role | undefined
  if (callerRole !== 'owner' && callerRole !== 'admin') return forbidden()

  let body: ResendBody = {}
  try {
    body = (await request.json()) as ResendBody
  } catch {
    // body opcional
  }

  const admin = createAdminClient()

  // ─── Resolve escopo do caller (mesma lógica do DELETE) ──────────────────
  let scopedOrgId: string
  if (callerRole === 'owner') {
    const ctx = await getActiveOrgContext()
    if (!ctx?.activeOrgId) {
      return serverError('Não foi possível identificar a organização do solicitante')
    }
    scopedOrgId = ctx.activeOrgId
  } else {
    const orgIdParam = request.nextUrl.searchParams.get('orgId')
    if (!orgIdParam || !UUID_RE.test(orgIdParam)) {
      return badRequest('orgId é obrigatório no querystring quando admin reenvia')
    }
    scopedOrgId = orgIdParam
  }

  // ─── Busca a membership pendente do alvo no escopo ──────────────────────
  const { data: pending, error: memErr } = await admin
    .from('memberships')
    .select('user_id, org_id, role, invite_status')
    .eq('user_id', id)
    .eq('org_id', scopedOrgId)
    .eq('invite_status', 'pending')
    .maybeSingle()
  if (memErr) return serverError('Não foi possível localizar o convite', memErr)
  if (!pending) return notFound('Convite')

  // Owner não reenvia convite de outro owner (defesa-em-profundidade).
  if (callerRole === 'owner' && pending.role !== 'trainer') return forbidden()

  // ─── Busca dados do user e da org pra montar o email ────────────────────
  const [{ data: user, error: userErr }, { data: org, error: orgErr }] = await Promise.all([
    admin.from('users').select('id, name, email').eq('id', id).maybeSingle(),
    admin.from('organizations').select('id, name').eq('id', scopedOrgId).maybeSingle(),
  ])
  if (userErr) return serverError('Não foi possível resolver o convidado', userErr)
  if (orgErr) return serverError('Não foi possível resolver a organização', orgErr)
  if (!user?.email) return notFound('Convite')
  if (!org) return notFound('Organização')

  // users.name pode ser NULL em registros legados (anteriores ao 020). Sem
  // ele, ainda dá pra reenviar — usamos o local-part do email como saudação.
  // Inviter pode atualizar o nome depois via convite acompanhado do form.
  const inviteeName = user.name?.trim() || user.email.split('@')[0]

  // ─── Gera token + envia email ───────────────────────────────────────────
  try {
    const result = await sendInviteEmail({
      userId: id,
      orgId: scopedOrgId,
      role: pending.role,
      inviteeName,
      inviteeEmail: user.email,
      orgName: org.name,
      inviterId: session.user.id,
      origin: request.nextUrl.origin,
      locale: body.locale,
    })

    return ok({
      id,
      email: user.email,
      orgId: scopedOrgId,
      ...result,
    })
  } catch (err) {
    return serverError('Não foi possível reenviar o convite', err)
  }
}
