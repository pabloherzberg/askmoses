import { type NextRequest } from 'next/server'
import { Resend } from 'resend'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildInviteEmail } from '@/lib/email/invite-template'
import type { Role } from '@/lib/types'

interface InviteBody {
  name?: string
  email?: string
  role?: 'trainer' | 'owner'
  orgId?: string  // required when caller is admin
  ownerId?: string // required when admin invites a trainer
  locale?: string  // locale do convidante; usado pra escolher o idioma do email
}

interface AppMetadata { role?: Role; org_id?: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function badRequest(message: string) {
  return Response.json(
    { data: null, error: { message, code: 400 } },
    { status: 400 }
  )
}

function conflict(message: string) {
  return Response.json(
    { data: null, error: { message, code: 409 } },
    { status: 409 }
  )
}

function serverError(context: string, err?: unknown) {
  console.error(`[invites] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 }
  )
}

function deriveAvatar(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const AVATAR_COLORS = ['blue', 'purple', 'green', 'red', 'amber'] as const

function pickAvatarColor(email: string): typeof AVATAR_COLORS[number] {
  let hash = 0
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const callerRole = session.user.app_metadata?.role as Role | undefined
  const callerId = session.user.id
  const callerOrgId = session.user.app_metadata?.org_id as string | undefined

  if (callerRole !== 'owner' && callerRole !== 'admin') return forbidden()

  let body: InviteBody
  try {
    body = (await request.json()) as InviteBody
  } catch {
    return badRequest('Body inválido')
  }

  const name = body.name?.trim()
  const email = body.email?.trim().toLowerCase()
  const targetRole = body.role

  if (!name) return badRequest('name é obrigatório')
  if (!email || !EMAIL_RE.test(email)) return badRequest('email inválido')
  if (targetRole !== 'trainer' && targetRole !== 'owner') {
    return badRequest('role deve ser "trainer" ou "owner"')
  }

  // ─── Permissões e resolução de org/owner ─────────────────────────────────
  let targetOrgId: string
  let targetOwnerId: string | null = null // FK para public.owners.id (só usado quando role='trainer')

  const admin = createAdminClient()

  if (callerRole === 'owner') {
    if (targetRole !== 'trainer') {
      return forbidden() // owner só convida trainer
    }
    if (!callerOrgId) return serverError('Não foi possível identificar a organização do solicitante')
    targetOrgId = callerOrgId

    // Resolve owners.id a partir do user_id do caller
    const { data: ownerRow, error: ownerErr } = await admin
      .from('owners')
      .select('id')
      .eq('user_id', callerId)
      .maybeSingle()
    if (ownerErr || !ownerRow) return serverError('Não foi possível identificar o solicitante', ownerErr)
    targetOwnerId = ownerRow.id
  } else {
    // admin
    if (!body.orgId) return badRequest('orgId é obrigatório quando admin convida')
    targetOrgId = body.orgId

    if (targetRole === 'trainer') {
      if (!body.ownerId) return badRequest('ownerId é obrigatório quando admin convida um trainer')
      // valida que o owner existe e pertence à org informada (via users.org_id do owner)
      const { data: ownerRow, error: ownerErr } = await admin
        .from('owners')
        .select('id, user_id')
        .eq('id', body.ownerId)
        .maybeSingle()
      if (ownerErr) return serverError('Não foi possível validar o destinatário', ownerErr)

      let validOwner = false
      if (ownerRow) {
        const { data: ownerUser, error: ownerUserErr } = await admin
          .from('users')
          .select('org_id')
          .eq('id', ownerRow.user_id)
          .maybeSingle()
        if (ownerUserErr) return serverError('Não foi possível validar o destinatário', ownerUserErr)
        validOwner = !!ownerUser && ownerUser.org_id === targetOrgId
      }
      if (!validOwner || !ownerRow) {
        return badRequest('owner inválido para essa org')
      }
      targetOwnerId = ownerRow.id
    }
  }

  // ─── Email já existe? ────────────────────────────────────────────────────
  const { data: existing, error: existErr } = await admin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (existErr) return serverError('Não foi possível verificar o convite', existErr)
  if (existing) return conflict('Não foi possível enviar o convite')

  // ─── Org existe? ─────────────────────────────────────────────────────────
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', targetOrgId)
    .maybeSingle()
  if (orgErr) return serverError('Não foi possível validar a organização', orgErr)
  if (!org) return badRequest('org inválida')

  // ─── 1. generateLink — cria auth.user + retorna o token_hash do convite ──
  // O `action_link` retornado pelo Supabase aponta pro endpoint /auth/v1/verify
  // do Supabase, que redireciona com os tokens no HASH fragment — não chega no
  // servidor. Como nosso callback é server-side, usamos o `hashed_token` direto
  // numa rota nossa (/api/auth/accept-invite) que faz verifyOtp via SDK.
  const origin = request.headers.get('origin') ?? request.nextUrl.origin
  const homePath = targetRole === 'trainer' ? '/me' : '/dashboard'
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo: `${origin}/api/auth/accept-invite?next=${homePath}`,
      data: { name, role: targetRole },
    },
  })
  if (linkErr || !linkData?.user || !linkData.properties?.hashed_token) {
    return serverError('Não foi possível gerar o convite', linkErr)
  }
  const newUserId = linkData.user.id
  const tokenHash = linkData.properties.hashed_token
  const actionLink = `${origin}/api/auth/accept-invite?token_hash=${encodeURIComponent(tokenHash)}&type=invite&next=${encodeURIComponent(homePath)}`

  // Helper de rollback — usado quando algum passo posterior falha. Garante
  // que não deixamos auth.user/public.users/trainers/owners órfãos. As
  // chamadas .from(...).delete() não fazem throw (erro vai em .error);
  // para deleteUser usamos .catch porque ele realmente lança Promise rejeitada.
  const rollback = async () => {
    if (targetRole === 'trainer') {
      await admin.from('trainers').delete().eq('user_id', newUserId)
    } else {
      await admin.from('owners').delete().eq('user_id', newUserId)
    }
    await admin.from('users').delete().eq('id', newUserId)
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
  }

  // ─── 2. app_metadata para o JWT (role + org_id) ──────────────────────────
  const appMetadata: AppMetadata = { role: targetRole, org_id: targetOrgId }
  const { error: metaErr } = await admin.auth.admin.updateUserById(newUserId, {
    app_metadata: appMetadata,
  })
  if (metaErr) {
    // não bloqueia — log apenas (não vaza detalhes do provider)
    console.error('[invites] Não foi possível aplicar metadados do convite')
  }

  // ─── 3. INSERT public.users ──────────────────────────────────────────────
  const { error: usersErr } = await admin.from('users').insert({
    id: newUserId,
    name,
    email,
    role: targetRole,
    avatar: deriveAvatar(name),
    avatar_color: pickAvatarColor(email),
    org_id: targetOrgId,
    invited_by: callerId,
    invited_at: new Date().toISOString(),
    invite_status: 'pending',
  })
  if (usersErr) {
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
    return serverError('Não foi possível criar o convite', usersErr)
  }

  // ─── 4. INSERT em trainers OU owners ─────────────────────────────────────
  if (targetRole === 'trainer') {
    const { error: trainerErr } = await admin.from('trainers').insert({
      user_id: newUserId,
      owner_id: targetOwnerId,
      org_id: targetOrgId,
    })
    if (trainerErr) {
      await admin.from('users').delete().eq('id', newUserId)
      await admin.auth.admin.deleteUser(newUserId).catch(() => {})
      return serverError('Não foi possível concluir o convite', trainerErr)
    }
  } else {
    // owner
    const { error: ownerInsertErr } = await admin.from('owners').insert({
      user_id: newUserId,
      company: org.name,
      plan: 'Starter',
    })
    if (ownerInsertErr) {
      await admin.from('users').delete().eq('id', newUserId)
      await admin.auth.admin.deleteUser(newUserId).catch(() => {})
      return serverError('Não foi possível concluir o convite', ownerInsertErr)
    }
  }

  // ─── 5. Resolve nome do convidante (pra personalizar o email) ────────────
  const { data: inviterRow } = await admin
    .from('users')
    .select('name')
    .eq('id', callerId)
    .maybeSingle()
  const inviterName = inviterRow?.name ?? null

  // ─── 6. Envia o email via Resend ─────────────────────────────────────────
  const { subject, html } = buildInviteEmail({
    inviteeName: name,
    role: targetRole,
    orgName: org.name,
    inviterName,
    actionLink,
    locale: body.locale,
  })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // Sem Resend configurado (típico em dev): logamos o link pra desenvolvedor
    // copiar e prosseguimos. O usuário fica em pending — admin pode revogar
    // e reconvidar quando o key for configurado.
    console.warn(`[invites] RESEND_API_KEY ausente — convite criado em modo mock. action_link=${actionLink}`)
    return ok({
      id: newUserId,
      email,
      name,
      role: targetRole,
      orgId: targetOrgId,
      inviteStatus: 'pending',
      emailDelivery: 'mocked',
    })
  }

  const resend = new Resend(apiKey)
  const devOverride = process.env.DEV_EMAIL_OVERRIDE
  const toAddress = devOverride ?? email

  const { data: emailResult, error: sendErr } = await resend.emails.send({
    from: 'AskMoses.AI <noreply@askmoses.ai>',
    to: toAddress,
    subject,
    html,
  })

  if (sendErr) {
    console.error('[invites] Resend falhou — desfazendo o convite', sendErr)
    await rollback()
    return serverError('Não foi possível enviar o email do convite', sendErr)
  }

  return ok({
    id: newUserId,
    email,
    name,
    role: targetRole,
    orgId: targetOrgId,
    inviteStatus: 'pending',
    emailDelivery: 'sent',
    emailId: emailResult?.id ?? null,
  })
}

// ─── GET /api/invites — lista usuários convidados (pendentes + aceitos) ────
//   Owner: vê todos da própria org
//   Admin: vê todos; pode filtrar por org via ?orgId=…
//   Filtros opcionais: ?status=pending|accepted, ?role=trainer|owner
//   Paginação: ?page=1&pageSize=20 (max 100)
//   Resposta: { items, page, pageSize, total } — items vêm com org e
//   invitedBy resolvidos (id + name) para o admin/owner identificar o
//   responsável pelo convite sem chamadas extras.
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

interface UserRow {
  id: string
  name: string
  email: string
  role: Role
  avatar: string | null
  avatar_color: string | null
  org_id: string | null
  invited_by: string | null
  invited_at: string | null
  invite_status: 'pending' | 'accepted'
  created_at: string
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const callerRole = session.user.app_metadata?.role as Role | undefined
  const callerOrgId = session.user.app_metadata?.org_id as string | undefined

  if (callerRole !== 'owner' && callerRole !== 'admin') return forbidden()

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status')
  const role = searchParams.get('role')
  const orgIdParam = searchParams.get('orgId')
  const pageRaw = searchParams.get('page')
  const pageSizeRaw = searchParams.get('pageSize')

  if (status && status !== 'pending' && status !== 'accepted') {
    return badRequest('status inválido')
  }
  if (role && role !== 'trainer' && role !== 'owner') {
    return badRequest('role inválido')
  }

  const page = Math.max(1, parseInt(pageRaw ?? '1', 10) || 1)
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(pageSizeRaw ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  )
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const admin = createAdminClient()
  let query = admin
    .from('users')
    .select(
      'id, name, email, role, avatar, avatar_color, org_id, invited_by, invited_at, invite_status, created_at',
      { count: 'exact' }
    )
    .order('invited_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (callerRole === 'owner') {
    if (!callerOrgId) return serverError('Não foi possível identificar a organização do solicitante')
    query = query.eq('org_id', callerOrgId)
  } else if (orgIdParam) {
    query = query.eq('org_id', orgIdParam)
  }

  if (status) query = query.eq('invite_status', status)
  if (role) query = query.eq('role', role)

  const { data, error, count } = await query
  if (error) return serverError('Não foi possível listar os convites', error)

  const rows = (data ?? []) as UserRow[]

  // ─── Resolve org { id, name } e invitedBy { id, name } em batch ──────────
  const orgIds = Array.from(new Set(rows.map((r) => r.org_id).filter((v): v is string => !!v)))
  const inviterIds = Array.from(new Set(rows.map((r) => r.invited_by).filter((v): v is string => !!v)))

  const [orgsRes, invitersRes] = await Promise.all([
    orgIds.length > 0
      ? admin.from('organizations').select('id, name').in('id', orgIds)
      : Promise.resolve({ data: [], error: null }),
    inviterIds.length > 0
      ? admin.from('users').select('id, name').in('id', inviterIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (orgsRes.error) return serverError('Não foi possível resolver as organizações', orgsRes.error)
  if (invitersRes.error) return serverError('Não foi possível resolver os responsáveis', invitersRes.error)

  const orgById = new Map((orgsRes.data ?? []).map((o) => [o.id, o]))
  const inviterById = new Map((invitersRes.data ?? []).map((u) => [u.id, u]))

  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    avatar: r.avatar,
    avatar_color: r.avatar_color,
    invited_at: r.invited_at,
    invite_status: r.invite_status,
    created_at: r.created_at,
    org: r.org_id ? orgById.get(r.org_id) ?? null : null,
    invitedBy: r.invited_by ? inviterById.get(r.invited_by) ?? null : null,
  }))

  return ok({ items, page, pageSize, total: count ?? items.length })
}
