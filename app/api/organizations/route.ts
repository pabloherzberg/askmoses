import { type NextRequest } from 'next/server'
import { Resend } from 'resend'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildInviteEmail } from '@/lib/email/invite-template'
import { sendInviteEmail } from '@/lib/email/send-invite'
import type { Role } from '@/lib/types'

interface OrgOption {
  id: string
  name: string
  owners: { id: string; name: string; email: string }[]
}

interface OrgRow {
  id: string
  name: string
}

interface OwnerJoinRow {
  id: string
  org_id: string | null
  users: { id: string; name: string; email: string } | null
}

interface CreateOrgBody {
  name?: string
  planCode?: 'starter' | 'pro' | 'pro_rag'
  ownerName?: string
  ownerEmail?: string
  locale?: string
}

const PLAN_CODES = ['starter', 'pro', 'pro_rag'] as const
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Avatar helpers — duplicados de app/api/invites/route.ts pra manter o
// patch local. Se aparecer um 3º endpoint que precisa, extrair pra lib/.
function deriveAvatar(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const AVATAR_COLORS = ['blue', 'purple', 'green', 'red'] as const

function pickAvatarColor(email: string): typeof AVATAR_COLORS[number] {
  let hash = 0
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function badRequest(message: string) {
  return Response.json(
    { data: null, error: { message, code: 400 } },
    { status: 400 }
  )
}

function serverError(context: string, err?: unknown) {
  console.error(`[organizations] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 }
  )
}

// GET /api/organizations
//   Admin: retorna todas as orgs com seus owners (id + nome + email)
//   Owner/trainer: 403
export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  const admin = createAdminClient()

  // Owners JOIN users — owners.org_id é a FK canônica pós-migration 031.
  const [orgsRes, ownersRes] = await Promise.all([
    admin.from('organizations').select('id, name').order('name'),
    admin.from('owners').select('id, org_id, users!inner (id, name, email)'),
  ])

  if (orgsRes.error) return serverError('Não foi possível listar as organizações', orgsRes.error)
  if (ownersRes.error) return serverError('Não foi possível listar os responsáveis', ownersRes.error)

  const ownerRows = (ownersRes.data ?? []) as unknown as OwnerJoinRow[]
  const ownersByOrg = new Map<string, OrgOption['owners']>()
  for (const row of ownerRows) {
    if (!row.org_id || !row.users) continue
    const list = ownersByOrg.get(row.org_id) ?? []
    list.push({ id: row.id, name: row.users.name, email: row.users.email })
    ownersByOrg.set(row.org_id, list)
  }

  const result: OrgOption[] = ((orgsRes.data ?? []) as OrgRow[]).map((org) => ({
    id: org.id,
    name: org.name,
    owners: (ownersByOrg.get(org.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  }))

  return ok(result)
}

// POST /api/organizations
//   Body: { name, planCode, ownerName, ownerEmail, locale? }
//
//   Fluxo Admin-assisted (decisão Victor 2026-05-13, Q1+Q2): cria org +
//   Owner em uma única request, dispara magic link pro Owner. Usado pelos
//   sweetheart deals (Taking the Lead, Centurion). Self-service permanece
//   em /api/onboarding/organization (separado).
//
//   Sub default 'active' pq admin-created = cliente contratado off-platform.
//   Pra trial gratuito, Admin usa PATCH /api/admin/organizations/[id]/subscription
//   depois de criar.
//
//   Branches por estado do email:
//   - Email não existe (caso comum): generateLink('invite') cria auth.users
//     + token Supabase; email enviado via Resend com buildInviteEmail.
//   - Email já existe (Owner de outra org migrando, edge case): cria
//     membership pending + invite_tokens isolado (034) via sendInviteEmail.
//
//   Atomicidade: se qualquer step pós-org falhar, rollback completo
//   incluindo a própria org. Ariel não fica com org-sem-owner pendurada.
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  let body: CreateOrgBody
  try {
    body = (await request.json()) as CreateOrgBody
  } catch {
    return badRequest('Body inválido')
  }

  const name = body.name?.trim()
  const planCode = body.planCode
  const ownerName = body.ownerName?.trim()
  const ownerEmail = body.ownerEmail?.trim().toLowerCase()

  if (!name) return badRequest('name é obrigatório')
  if (!planCode || !PLAN_CODES.includes(planCode)) {
    return badRequest('planCode deve ser "starter", "pro" ou "pro_rag"')
  }
  if (!ownerName) return badRequest('ownerName é obrigatório')
  if (!ownerEmail || !EMAIL_RE.test(ownerEmail)) return badRequest('ownerEmail inválido')

  const admin = createAdminClient()
  const origin = request.nextUrl.origin

  // ─── 1. Resolve plano ────────────────────────────────────────────────────

  const { data: plan, error: planErr } = await admin
    .from('plans')
    .select('id, code')
    .eq('code', planCode)
    .maybeSingle()
  if (planErr) return serverError('Não foi possível resolver o plano', planErr)
  if (!plan) return badRequest('plano não encontrado')

  // ─── 2. Cria org ─────────────────────────────────────────────────────────

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      name,
      plan_id: plan.id,
      subscription_status: 'active',
      health: 'healthy',
    })
    .select('id, name')
    .single()
  if (orgErr || !org) return serverError('Não foi possível criar a organização', orgErr)

  // Rollback da org (usado por todos os caminhos de erro abaixo). Defina
  // antes de qualquer step que possa falhar.
  const rollbackOrg = async () => {
    await admin.from('organizations').delete().eq('id', org.id)
  }

  // ─── 3. Owner: branch por estado do email ────────────────────────────────

  const { data: existingUser, error: existErr } = await admin
    .from('users')
    .select('id, name')
    .eq('email', ownerEmail)
    .maybeSingle()
  if (existErr) {
    await rollbackOrg()
    return serverError('Não foi possível verificar o email do owner', existErr)
  }

  // ─── 3A. Email já existe: membership-only + invite_tokens ───────────────

  if (existingUser) {
    const { error: memErr } = await admin.from('memberships').insert({
      user_id: existingUser.id,
      org_id: org.id,
      role: 'owner',
      invite_status: 'pending',
      invited_by: session.user.id,
      invited_at: new Date().toISOString(),
    })
    if (memErr) {
      await rollbackOrg()
      return serverError('Não foi possível criar membership', memErr)
    }

    const { error: ownerInsertErr } = await admin.from('owners').insert({
      user_id: existingUser.id,
      org_id: org.id,
      company: org.name,
      plan: 'Starter',
    })
    if (ownerInsertErr) {
      await admin.from('memberships').delete()
        .eq('user_id', existingUser.id).eq('org_id', org.id)
      await rollbackOrg()
      return serverError('Não foi possível criar owner', ownerInsertErr)
    }

    try {
      await sendInviteEmail({
        userId: existingUser.id,
        orgId: org.id,
        role: 'owner',
        inviteeName: existingUser.name ?? ownerName,
        inviteeEmail: ownerEmail,
        orgName: org.name,
        inviterId: session.user.id,
        origin,
        locale: body.locale,
      })
    } catch (err) {
      // Rollback inclui invalidar token recém-gerado se já tiver sido
      // persistido em invite_tokens (sendInviteEmail insere antes do Resend).
      await admin.rpc('invalidate_active_invite_tokens', {
        p_user_id: existingUser.id,
        p_org_id: org.id,
      })
      await admin.from('owners').delete()
        .eq('user_id', existingUser.id).eq('org_id', org.id)
      await admin.from('memberships').delete()
        .eq('user_id', existingUser.id).eq('org_id', org.id)
      await rollbackOrg()
      return serverError('Não foi possível enviar o convite', err)
    }

    return ok({
      id: org.id,
      name: org.name,
      planCode: plan.code,
      ownerId: existingUser.id,
      ownerEmail,
      multiOrgAdded: true,
    })
  }

  // ─── 3B. Novo email: full bootstrap (auth.users + Supabase invite) ──────

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: ownerEmail,
    options: {
      redirectTo: `${origin}/api/auth/verify-otp?next=/dashboard`,
      data: { name: ownerName, role: 'owner' },
    },
  })
  if (linkErr || !linkData?.user || !linkData.properties?.hashed_token) {
    await rollbackOrg()
    return serverError('Não foi possível gerar o convite', linkErr)
  }
  const newUserId = linkData.user.id
  const tokenHash = linkData.properties.hashed_token
  // orgId no link: markInviteAccepted (verify-otp) aceita SÓ a membership
  // dessa org — coerente com o handling multi-org de /api/invites Branch B.
  const actionLink = `${origin}/api/auth/verify-otp?token_hash=${encodeURIComponent(tokenHash)}&type=invite&orgId=${encodeURIComponent(org.id)}&next=${encodeURIComponent('/dashboard')}`

  const rollbackFull = async () => {
    await admin.from('owners').delete().eq('user_id', newUserId)
    await admin.from('memberships').delete().eq('user_id', newUserId)
    await admin.from('users').delete().eq('id', newUserId)
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
    await rollbackOrg()
  }

  // app_metadata.role: lido por middleware/redirects pra rotear após login.
  // app_metadata.org_id: NÃO setamos — fonte de verdade é users.active_org_id.
  const { error: metaErr } = await admin.auth.admin.updateUserById(newUserId, {
    app_metadata: { role: 'owner' },
  })
  if (metaErr) {
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
    await rollbackOrg()
    return serverError('Não foi possível criar o convite', metaErr)
  }

  // users.role + users.invite_status são deprecated mas ainda existem.
  // Fonte canônica é memberships.{role,invite_status} + users.active_org_id.
  const { error: usersErr } = await admin.from('users').insert({
    id: newUserId,
    name: ownerName,
    email: ownerEmail,
    role: 'owner',
    avatar: deriveAvatar(ownerName),
    avatar_color: pickAvatarColor(ownerEmail),
    active_org_id: org.id,
    invite_status: 'pending',
  })
  if (usersErr) {
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
    await rollbackOrg()
    return serverError('Não foi possível criar o convite', usersErr)
  }

  const { error: memErr } = await admin.from('memberships').insert({
    user_id: newUserId,
    org_id: org.id,
    role: 'owner',
    invite_status: 'pending',
    invited_by: session.user.id,
    invited_at: new Date().toISOString(),
  })
  if (memErr) {
    await rollbackFull()
    return serverError('Não foi possível criar o convite', memErr)
  }

  const { error: ownerInsertErr } = await admin.from('owners').insert({
    user_id: newUserId,
    org_id: org.id,
    company: org.name,
    plan: 'Starter',
  })
  if (ownerInsertErr) {
    await rollbackFull()
    return serverError('Não foi possível concluir o convite', ownerInsertErr)
  }

  const { data: inviterRow } = await admin
    .from('users')
    .select('name')
    .eq('id', session.user.id)
    .maybeSingle()
  const inviterName = inviterRow?.name ?? null

  const { subject, html } = buildInviteEmail({
    inviteeName: ownerName,
    role: 'owner',
    orgName: org.name,
    inviterName,
    actionLink,
    locale: body.locale,
  })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn(`[organizations] RESEND_API_KEY ausente — convite criado em modo mock. action_link=${actionLink}`)
    return ok({
      id: org.id,
      name: org.name,
      planCode: plan.code,
      ownerId: newUserId,
      ownerEmail,
      emailDelivery: 'mocked',
    })
  }

  const resend = new Resend(apiKey)
  const devOverride = process.env.DEV_EMAIL_OVERRIDE
  const toAddress = devOverride ?? ownerEmail

  const { data: emailResult, error: sendErr } = await resend.emails.send({
    from: 'AskMoses.AI <noreply@askmoses.ai>',
    to: toAddress,
    subject,
    html,
  })

  if (sendErr) {
    console.error('[organizations] Resend falhou — desfazendo criação completa', sendErr)
    await rollbackFull()
    return serverError('Não foi possível enviar o email do convite', sendErr)
  }

  return ok({
    id: org.id,
    name: org.name,
    planCode: plan.code,
    ownerId: newUserId,
    ownerEmail,
    emailDelivery: 'sent',
    emailId: emailResult?.id ?? null,
  })
}
