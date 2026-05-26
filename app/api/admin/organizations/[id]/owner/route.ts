import { randomBytes } from 'crypto'
import { type NextRequest } from 'next/server'
import { forbidden, getSession, notFound, ok, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { checkRateLimitDb, rateLimitedResponse } from '@/lib/auth/rate-limit'
import { sendInviteEmail } from '@/lib/email/send-invite'
import type { Role } from '@/lib/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_SECONDS = 60

interface PatchBody {
  email?: string
  locale?: string
}

function badRequest(message: string, reason?: string) {
  return Response.json(
    { data: null, error: { message, code: 400, reason } },
    { status: 400 },
  )
}

function serverError(context: string, err?: unknown) {
  console.error(`[admin/owner] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 },
  )
}

// PATCH /api/admin/organizations/[id]/owner
//
//   Body: { email: string, locale?: string }
//
//   Admin troca o email do owner de uma org. Side-effects intencionais:
//     - auth.users.email atualizado (com email_confirm=true pra pular o
//       passo de confirmação do Supabase)
//     - password atual invalidada (random forte) — admin não pode sequestrar
//       conta trocando email sem que o dono do email novo confirme posse
//     - app_metadata.password_set=false — middleware vai redirecionar o
//       owner pra /password no próximo acesso
//     - users.email espelhado pra coerência com queries locais
//     - memberships.invite_status volta pra 'pending' — gate de magic-link
//       só libera depois que owner aceitar o novo invite
//     - sendInviteEmail dispara um link novo pro email novo (mesmo helper
//       do POST /api/organizations Branch 3B)
//
//   Sessões antigas: updateUserById com password novo invalida refresh
//   tokens no Supabase. Owner é deslogado dentro do TTL do JWT atual
//   (~1h max). Combinado com invite_status='pending', mesmo magic link
//   antigo deixa de funcionar.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params
  if (!orgId || !UUID_RE.test(orgId)) return badRequest('orgId inválido')

  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return unauthorized()
  const callerRole = session.user.app_metadata?.role as Role | undefined
  if (callerRole !== 'admin') return forbidden()

  const rl = await checkRateLimitDb(
    `admin:owner-email:${session.user.id}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_SECONDS,
  )
  if (!rl.allowed) return rateLimitedResponse(rl)

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return badRequest('Body inválido')
  }

  const newEmail = body.email?.trim().toLowerCase()
  if (!newEmail || !EMAIL_RE.test(newEmail)) {
    return badRequest('Email inválido', 'EMAIL_INVALID')
  }

  const admin = createAdminClient()

  // ─── Resolve owner da org ───────────────────────────────────────────────
  const { data: ownerMembership, error: memErr } = await admin
    .from('memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle()
  if (memErr) return serverError('lookup membership falhou', memErr)
  if (!ownerMembership?.user_id) return notFound('Owner')

  const ownerUserId = ownerMembership.user_id as string

  // ─── Resolve org e user atuais (pro email e pro nome do invite) ─────────
  const [orgRes, userRes] = await Promise.all([
    admin.from('organizations').select('id, name').eq('id', orgId).maybeSingle(),
    admin.from('users').select('id, name, email').eq('id', ownerUserId).maybeSingle(),
  ])
  if (orgRes.error) return serverError('lookup org falhou', orgRes.error)
  if (userRes.error) return serverError('lookup user falhou', userRes.error)
  if (!orgRes.data) return notFound('Organização')
  if (!userRes.data) return notFound('Owner')

  const org = orgRes.data as { id: string; name: string }
  const user = userRes.data as { id: string; name: string | null; email: string }

  // Mesmo email — no-op silencioso pra evitar invalidar senha sem motivo.
  if (user.email.toLowerCase() === newEmail) {
    return ok({ email: user.email, changed: false })
  }

  // ─── Update auth.users ──────────────────────────────────────────────────
  // password novo aleatório invalida login com senha antiga + dispara
  // invalidação de refresh tokens (comportamento Supabase v2).
  const randomPassword = randomBytes(32).toString('base64url')
  const { data: currentAuth, error: getAuthErr } = await admin.auth.admin.getUserById(ownerUserId)
  if (getAuthErr || !currentAuth?.user) {
    return serverError('lookup auth user falhou', getAuthErr)
  }
  const currentMeta = (currentAuth.user.app_metadata ?? {}) as Record<string, unknown>

  const { error: updateAuthErr } = await admin.auth.admin.updateUserById(ownerUserId, {
    email: newEmail,
    email_confirm: true,
    password: randomPassword,
    app_metadata: { ...currentMeta, password_set: false },
  })
  if (updateAuthErr) return serverError('update auth.users falhou', updateAuthErr)

  // ─── Espelha email + invite_status na tabela users (legacy mirror) ──────
  const { error: usersErr } = await admin
    .from('users')
    .update({ email: newEmail, invite_status: 'pending' })
    .eq('id', ownerUserId)
  if (usersErr) console.warn('[admin/owner] update users mirror falhou', usersErr)

  // ─── Membership volta pra pending ──────────────────────────────────────
  const { error: memUpdateErr } = await admin
    .from('memberships')
    .update({ invite_status: 'pending' })
    .eq('user_id', ownerUserId)
    .eq('org_id', orgId)
  if (memUpdateErr) console.warn('[admin/owner] update membership falhou', memUpdateErr)

  // ─── Dispara invite email pro endereço novo ─────────────────────────────
  const inviteeName = user.name?.trim() || newEmail.split('@')[0]
  try {
    const result = await sendInviteEmail({
      userId: ownerUserId,
      orgId,
      role: 'owner',
      inviteeName,
      inviteeEmail: newEmail,
      orgName: org.name,
      inviterId: session.user.id,
      origin: request.nextUrl.origin,
      locale: body.locale,
    })

    return ok({
      ownerId: ownerUserId,
      email: newEmail,
      changed: true,
      ...result,
    })
  } catch (err) {
    return serverError('sendInviteEmail falhou', err)
  }
}
