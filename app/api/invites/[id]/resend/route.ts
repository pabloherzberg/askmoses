import { type NextRequest } from 'next/server'
import { randomBytes, createHash } from 'crypto'
import { Resend } from 'resend'
import { getActiveOrgContext, getSession, ok, unauthorized, forbidden, notFound } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildInviteEmail } from '@/lib/email/invite-template'
import type { Role } from '@/lib/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Janela de validade do token reenviado. Convites costumam ser usados em
// horas/dias — 7 dias deixa folga pra fim de semana e timezone do convidado.
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

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

// ─── Token helpers ──────────────────────────────────────────────────────────
// 32 bytes random → 43 chars base64url. Cleartext só vai no email; o DB
// guarda apenas o SHA-256 (token_hash). Lookup no callback é por hash do
// que o cliente apresentou.

function generateToken(): { cleartext: string; hash: string } {
  const cleartext = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(cleartext).digest('hex')
  return { cleartext, hash }
}

// POST /api/invites/[id]/resend?orgId=<uuid>
//   Owner: reenvia convite pendente da própria org ATIVA. orgId no query é
//          ignorado.
//   Admin: orgId é OBRIGATÓRIO no querystring (multi-org).
//   Trainer: 403.
//
// Diferente do POST /api/invites (Branch B), este endpoint NÃO usa o token
// do auth do Supabase — usa nossa própria tabela invite_tokens (migration
// 034). Resultado: reenviar pra (user, org_B) não invalida o link da
// org_A do mesmo email.
//
// Fluxo:
//   1) invalida tokens ativos de (user, org) via RPC
//   2) insere token novo (hash SHA-256) na invite_tokens
//   3) atualiza memberships.invited_at
//   4) envia email com cleartext apontando pra /api/auth/verify-invite-token
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id || !UUID_RE.test(id)) return badRequest('Identificador inválido')

  const session = await getSession()
  if (!session) return unauthorized()

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
  if (!user?.email || !user?.name) return notFound('Convite')
  if (!org) return notFound('Organização')

  // ─── 1. Invalida tokens ativos de (user, org) ───────────────────────────
  // Atomic via RPC (migration 034). Se um token anterior estava ativo, ele
  // recebe invalidated_at = now(). Permite a partial unique index aceitar
  // o INSERT do token novo logo abaixo.
  const { error: invalidateErr } = await admin.rpc('invalidate_active_invite_tokens', {
    p_user_id: id,
    p_org_id: scopedOrgId,
  })
  if (invalidateErr) return serverError('Não foi possível invalidar tokens anteriores', invalidateErr)

  // ─── 2. Gera token novo + insere ───────────────────────────────────────
  const { cleartext, hash } = generateToken()
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()

  const { error: insertErr } = await admin.from('invite_tokens').insert({
    user_id: id,
    org_id: scopedOrgId,
    token_hash: hash,
    expires_at: expiresAt,
    created_by: session.user.id,
  })
  if (insertErr) return serverError('Não foi possível registrar o novo token', insertErr)

  // ─── 3. Atualiza invited_at pra refletir o último envio ─────────────────
  // Não bloqueante — se falhar, o token já existe e o email vai sair.
  await admin
    .from('memberships')
    .update({ invited_at: new Date().toISOString() })
    .eq('user_id', id)
    .eq('org_id', scopedOrgId)

  // ─── 4. Monta action link e dispara email ───────────────────────────────
  const origin = request.nextUrl.origin
  const homePath = pending.role === 'trainer' ? '/me' : '/dashboard'
  const actionLink = `${origin}/api/auth/verify-invite-token?token=${encodeURIComponent(cleartext)}&next=${encodeURIComponent(homePath)}`

  const { data: inviterRow } = await admin
    .from('users')
    .select('name')
    .eq('id', session.user.id)
    .maybeSingle()
  const inviterName = inviterRow?.name ?? null

  const { subject, html } = buildInviteEmail({
    inviteeName: user.name,
    role: pending.role,
    orgName: org.name,
    inviterName,
    actionLink,
    locale: body.locale,
  })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn(`[invites:resend] RESEND_API_KEY ausente — modo mock. action_link=${actionLink}`)
    return ok({
      id,
      email: user.email,
      orgId: scopedOrgId,
      emailDelivery: 'mocked',
    })
  }

  const resend = new Resend(apiKey)
  const devOverride = process.env.DEV_EMAIL_OVERRIDE
  const toAddress = devOverride ?? user.email

  const { data: emailResult, error: sendErr } = await resend.emails.send({
    from: 'AskMoses.AI <noreply@askmoses.ai>',
    to: toAddress,
    subject,
    html,
  })

  if (sendErr) {
    return serverError('Não foi possível enviar o email do convite', sendErr)
  }

  return ok({
    id,
    email: user.email,
    orgId: scopedOrgId,
    emailDelivery: 'sent',
    emailId: emailResult?.id ?? null,
  })
}
