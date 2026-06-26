import { type NextRequest } from 'next/server'
import { Resend } from 'resend'
import { getSession, ok, unauthorized, forbidden, requireActiveSubscription, requireOwnerWrite } from '@/lib/auth'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildInviteEmail } from '@/lib/email/invite-template'
import { sendInviteEmail } from '@/lib/email/send-invite'
import { dbGetMemberGhlUserIdsByOrg } from '@/lib/db/trainers'
import {
  resolveGhlUserForOrg,
  GhlLinkValidationError,
  ghlLinkErrorResponse,
} from '@/lib/services/ghl-user-link'
import type { Role } from '@/lib/types'

interface InviteBody {
  name?: string
  email?: string
  role?: 'trainer' | 'owner'
  orgId?: string  // required when caller is admin
  ownerId?: string // required when admin invites a trainer
  ghlUserId?: string // required when inviting a trainer (vínculo GHL)
  locale?: string
}

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

function planLimitExceeded(message: string) {
  return Response.json(
    { data: null, error: { message, code: 403 } },
    { status: 403 }
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

// Enum `avatar_color` no banco aceita apenas blue/purple/green/red.
// 'amber' existe no tipo TS mas não no enum do Supabase — manter fora daqui
// até haver migration que adicione o valor (seed também usa só estes 4).
const AVATAR_COLORS = ['blue', 'purple', 'green', 'red'] as const

function pickAvatarColor(email: string): typeof AVATAR_COLORS[number] {
  let hash = 0
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

// POST /api/invites
//   Owner: convida trainer pra própria org (ativa).
//   Admin: convida owner ou trainer pra qualquer org (orgId obrigatório).
//   Branch existente vs novo email:
//     - email já tem conta → cria membership 'pending' + email com token
//       per-org (invite_tokens). O user TEM que clicar no link da nova org
//       pra aceitar — convite anterior aceito não dá auto-join.
//     - email não tem conta → fluxo completo (auth user + magic link + email)
//   TC-11: bloqueia trainer invite se org no plano starter/pro atingiu o
//   max_sales_people. Conta memberships role='trainer' com status pending+accepted.
export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return unauthorized()

  // Admin impersonando NÃO pode convidar trainer/owner pra org alheia —
  // mesmo que app_metadata.role='admin' permita o caller passar o role
  // check, requireOwnerWrite bloqueia o caminho impersonate. Admin operando
  // do próprio painel (sem impersonate) continua passando.
  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const callerRole = session.user.app_metadata?.role as Role | undefined
  const callerId = session.user.id

  if (callerRole !== 'owner' && callerRole !== 'admin') return forbidden()

  // Owner sem subscription ativa não pode convidar — força ativar plano primeiro.
  // Admin bypassa (loadOrgContext retorna 'active' pra super-admin). Sem isso,
  // owner em onboarding mid-flight podia gastar seats antes mesmo de pagar.
  // Resposta 402 (Payment Required) é semanticamente correta vs 403.
  if (callerRole === 'owner') {
    const subErr = await requireActiveSubscription()
    if (subErr) return subErr
  }

  let body: InviteBody
  try {
    body = (await request.json()) as InviteBody
  } catch {
    return badRequest('Body inválido')
  }

  // Mutáveis: para trainer vinculado ao GHL, nome/email são sobrescritos
  // com os valores canônicos do GHL (fonte da verdade — evita divergência).
  let name = body.name?.trim()
  let email = body.email?.trim().toLowerCase()
  const targetRole = body.role

  if (!name) return badRequest('name é obrigatório')
  if (!email || !EMAIL_RE.test(email)) return badRequest('email inválido')
  if (targetRole !== 'trainer' && targetRole !== 'owner') {
    return badRequest('role deve ser "trainer" ou "owner"')
  }

  const admin = createAdminClient()

  // ─── Resolve targetOrgId + targetOwnerId ─────────────────────────────────

  let targetOrgId: string
  let targetOwnerId: string | null = null

  if (callerRole === 'owner') {
    if (targetRole !== 'trainer') return forbidden() // owner só convida trainer

    const { data: callerUser, error: callerErr } = await admin
      .from('users')
      .select('active_org_id')
      .eq('id', callerId)
      .maybeSingle()
    if (callerErr) return serverError('Não foi possível identificar o solicitante', callerErr)
    if (!callerUser?.active_org_id) {
      return serverError('Não foi possível identificar a organização do solicitante')
    }
    targetOrgId = callerUser.active_org_id

    // Garante que o caller é owner-membership na org ativa (não só admin que setou active_org_id)
    const { data: callerMembership } = await admin
      .from('memberships')
      .select('role')
      .eq('user_id', callerId)
      .eq('org_id', targetOrgId)
      .eq('invite_status', 'accepted')
      .maybeSingle()
    if (callerMembership?.role !== 'owner') return forbidden()

    const { data: ownerRow, error: ownerErr } = await admin
      .from('owners')
      .select('id')
      .eq('user_id', callerId)
      .eq('org_id', targetOrgId)
      .maybeSingle()
    if (ownerErr || !ownerRow) {
      return serverError('Não foi possível identificar o solicitante', ownerErr)
    }
    targetOwnerId = ownerRow.id
  } else {
    // admin
    if (!body.orgId) return badRequest('orgId é obrigatório quando admin convida')
    targetOrgId = body.orgId

    if (targetRole === 'trainer') {
      if (!body.ownerId) return badRequest('ownerId é obrigatório quando admin convida um trainer')

      const { data: ownerRow, error: ownerErr } = await admin
        .from('owners')
        .select('id, org_id')
        .eq('id', body.ownerId)
        .maybeSingle()
      if (ownerErr) return serverError('Não foi possível validar o destinatário', ownerErr)
      if (!ownerRow || ownerRow.org_id !== targetOrgId) {
        return badRequest('owner inválido para essa org')
      }
      targetOwnerId = ownerRow.id
    }
  }

  // ─── Org existe? ─────────────────────────────────────────────────────────

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', targetOrgId)
    .maybeSingle()
  if (orgErr) return serverError('Não foi possível validar a organização', orgErr)
  if (!org) return badRequest('org inválida')

  // ─── Vínculo GHL (apenas trainer) ─────────────────────────────────────────
  // Trainer é criado a partir de um usuário do GHL: bloqueia se a org não tem
  // a integração habilitada, exige um ghlUserId válido e não duplicado, e usa
  // nome/email do GHL como fonte da verdade. Owner segue o fluxo manual.
  let resolvedGhlUserId: string | null = null
  if (targetRole === 'trainer') {
    const ghlUserId = body.ghlUserId?.trim()
    if (!ghlUserId) return badRequest('ghlUserId é obrigatório para adicionar um vendedor')

    let match
    try {
      match = await resolveGhlUserForOrg(targetOrgId, ghlUserId)
    } catch (err) {
      if (err instanceof GhlLinkValidationError) return ghlLinkErrorResponse(err)
      return serverError('Não foi possível validar o vínculo GHL', err)
    }

    // Fonte da verdade: nome/email vêm do GHL, não do que o cliente digitou.
    // Revalida os valores do GHL com as mesmas regras do input manual — um
    // usuário do GHL com nome/email malformado não pode furar as garantias
    // que name/email tinham antes (senão geramos um auth user inválido).
    resolvedGhlUserId = ghlUserId
    name = match.name.trim()
    email = match.email.trim().toLowerCase()
    if (!name) return badRequest('Usuário do GHL sem nome válido')
    if (!EMAIL_RE.test(email)) return badRequest('Usuário do GHL com email inválido')
  }

  // ─── TC-11: Gate de seats (apenas trainer invite) ────────────────────────
  // Pós-merge (migration 038), organizations tem plan_id direto — JOIN puxa
  // plans sem passar por clients. Se max_sales_people é NULL (Pro/Pro+RAG,
  // ilimitado), pula o gate. Caller owner sem sub ativa já foi barrado antes
  // por requireActiveSubscription() — aqui só chega quem tem plano ativo.

  if (targetRole === 'trainer') {
    const { data: orgRow, error: orgErr } = await admin
      .from('organizations')
      .select('plans(max_sales_people)')
      .eq('id', targetOrgId)
      .maybeSingle()
    if (orgErr) return serverError('Não foi possível resolver o plano da organização', orgErr)

    const planNested = (orgRow?.plans ?? null) as { max_sales_people: number | null } | null
    const maxSeats = planNested?.max_sales_people

    if (typeof maxSeats === 'number') {
      const { count, error: countErr } = await admin
        .from('memberships')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', targetOrgId)
        .eq('role', 'trainer')
        .in('invite_status', ['pending', 'accepted'])
      if (countErr) return serverError('Não foi possível contar seats', countErr)

      if ((count ?? 0) >= maxSeats) {
        return planLimitExceeded(
          `Limite de ${maxSeats} reps atingido para o plano dessa organização. Faça upgrade do plano para convidar mais reps.`
        )
      }
    }
  }

  // ─── Email já existe? ────────────────────────────────────────────────────

  const { data: existingUser, error: existErr } = await admin
    .from('users')
    .select('id, name, invite_status')
    .eq('email', email)
    .maybeSingle()
  if (existErr) return serverError('Não foi possível verificar o convite', existErr)

  // ─── Branch A: existing user → membership-only, sem auth flow ────────────

  if (existingUser) {
    const { data: existingMembership } = await admin
      .from('memberships')
      .select('user_id')
      .eq('user_id', existingUser.id)
      .eq('org_id', targetOrgId)
      .maybeSingle()
    if (existingMembership) return conflict('Usuário já é membro dessa organização')

    // Toda nova membership entra 'pending' — mesmo que o user já tenha
    // verificado outro convite no passado. Cada org exige clique no link
    // específico daquela org (invite_tokens), senão alguém poderia
    // adicionar um email já-verificado a uma segunda org sem o dono do
    // email autorizar.
    const inviteStatus = 'pending' as const

    const { error: memErr } = await admin.from('memberships').insert({
      user_id: existingUser.id,
      org_id: targetOrgId,
      role: targetRole,
      invite_status: inviteStatus,
      invited_by: callerId,
      invited_at: new Date().toISOString(),
    })
    if (memErr) {
      // Trigger 032 levanta P0001 quando seat cap excedido — race-safe
      const msg = (memErr as { message?: string }).message ?? ''
      if (msg.includes('PLAN_LIMIT_SEATS')) {
        return planLimitExceeded(
          `Limite de reps atingido para o plano dessa organização. Faça upgrade do plano para convidar mais reps.`
        )
      }
      return serverError('Não foi possível adicionar à organização', memErr)
    }

    if (targetRole === 'trainer') {
      const { error } = await admin.from('trainers').insert({
        user_id: existingUser.id,
        owner_id: targetOwnerId,
        org_id: targetOrgId,
        ghl_user_id: resolvedGhlUserId,
      })
      if (error) {
        await admin.from('memberships').delete()
          .eq('user_id', existingUser.id).eq('org_id', targetOrgId)
        return serverError('Não foi possível criar trainer', error)
      }
    } else {
      const { error } = await admin.from('owners').insert({
        user_id: existingUser.id,
        org_id: targetOrgId,
        company: org.name,
        plan: 'Starter',
      })
      if (error) {
        await admin.from('memberships').delete()
          .eq('user_id', existingUser.id).eq('org_id', targetOrgId)
        return serverError('Não foi possível criar owner', error)
      }
    }

    // Token isolado por (user, org) via invite_tokens (migration 034) —
    // clicar no link aceita SOMENTE essa membership, sem afetar pendências
    // do mesmo user em outras orgs. O email vai sempre, mesmo se o user já
    // tem conta verificada de outra org.
    let emailDelivery: 'sent' | 'mocked' | 'none' = 'none'
    let emailId: string | null = null

    try {
      const result = await sendInviteEmail({
        userId: existingUser.id,
        orgId: targetOrgId,
        role: targetRole,
        // Usamos o name do DB (já validado em convite anterior); o name
        // do body é o que o inviter digitou — pode divergir.
        inviteeName: existingUser.name ?? name,
        inviteeEmail: email,
        orgName: org.name,
        inviterId: callerId,
        origin: request.nextUrl.origin,
        locale: body.locale,
      })
      emailDelivery = result.emailDelivery
      emailId = result.emailId
    } catch (err) {
      // Rollback: invite_tokens + trainer/owner row + membership. O user em
      // si fica — ele já existia antes desta request.
      //
      // invite_tokens é invalidado primeiro porque sendInviteEmail insere o
      // token ANTES de chamar o Resend — se o envio falha, sobra token ativo
      // sem membership correspondente (estado órfão). Sem essa limpeza, se o
      // email foi entregue apesar do erro, o link levaria a um consume sem
      // membership pra aceitar.
      await admin.rpc('invalidate_active_invite_tokens', {
        p_user_id: existingUser.id,
        p_org_id: targetOrgId,
      })
      if (targetRole === 'trainer') {
        await admin.from('trainers').delete()
          .eq('user_id', existingUser.id).eq('org_id', targetOrgId)
      } else {
        await admin.from('owners').delete()
          .eq('user_id', existingUser.id).eq('org_id', targetOrgId)
      }
      await admin.from('memberships').delete()
        .eq('user_id', existingUser.id).eq('org_id', targetOrgId)
      return serverError('Não foi possível enviar o email do convite', err)
    }

    return ok({
      id: existingUser.id,
      email,
      name,
      role: targetRole,
      orgId: targetOrgId,
      inviteStatus,
      emailDelivery,
      emailId,
      multiOrgAdded: true,
    })
  }

  // ─── Branch B: new user → full invite flow ───────────────────────────────

  const origin = request.nextUrl.origin
  const homePath = targetRole === 'trainer' ? '/me' : '/dashboard'
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo: `${origin}/api/auth/verify-otp?next=${homePath}`,
      data: { name, role: targetRole },
    },
  })
  if (linkErr || !linkData?.user || !linkData.properties?.hashed_token) {
    return serverError('Não foi possível gerar o convite', linkErr)
  }
  const newUserId = linkData.user.id
  const tokenHash = linkData.properties.hashed_token
  // orgId no link: markInviteAccepted (verify-otp) aceita SÓ a membership
  // dessa org. Sem isso, voltaria a aceitar todas as pendentes do user de
  // uma vez (bug histórico do multi-org).
  const actionLink = `${origin}/api/auth/verify-otp?token_hash=${encodeURIComponent(tokenHash)}&type=invite&orgId=${encodeURIComponent(targetOrgId)}&next=${encodeURIComponent(homePath)}`

  const rollback = async () => {
    if (targetRole === 'trainer') {
      await admin.from('trainers').delete().eq('user_id', newUserId)
    } else {
      await admin.from('owners').delete().eq('user_id', newUserId)
    }
    await admin.from('memberships').delete().eq('user_id', newUserId)
    await admin.from('users').delete().eq('id', newUserId)
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
  }

  // app_metadata.role: lido por middleware/redirects pra rotear após login.
  // app_metadata.org_id: NÃO setamos — fonte de verdade é users.active_org_id.
  const { error: metaErr } = await admin.auth.admin.updateUserById(newUserId, {
    app_metadata: { role: targetRole },
  })
  if (metaErr) {
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
    return serverError('Não foi possível criar o convite', metaErr)
  }

  // users.role + users.invite_status são deprecated mas ainda existem.
  // Setamos com valores que não quebram queries legadas; fonte canônica
  // é memberships.{role,invite_status} + users.active_org_id.
  const { error: usersErr } = await admin.from('users').insert({
    id: newUserId,
    name,
    email,
    role: targetRole,
    avatar: deriveAvatar(name),
    avatar_color: pickAvatarColor(email),
    active_org_id: targetOrgId,
    invite_status: 'pending',
  })
  if (usersErr) {
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
    return serverError('Não foi possível criar o convite', usersErr)
  }

  const { error: memErr } = await admin.from('memberships').insert({
    user_id: newUserId,
    org_id: targetOrgId,
    role: targetRole,
    invite_status: 'pending',
    invited_by: callerId,
    invited_at: new Date().toISOString(),
  })
  if (memErr) {
    await admin.from('users').delete().eq('id', newUserId)
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
    const msg = (memErr as { message?: string }).message ?? ''
    if (msg.includes('PLAN_LIMIT_SEATS')) {
      return planLimitExceeded(
        `Limite de reps atingido para o plano dessa organização. Faça upgrade do plano para convidar mais reps.`
      )
    }
    return serverError('Não foi possível criar o convite', memErr)
  }

  if (targetRole === 'trainer') {
    const { error: trainerErr } = await admin.from('trainers').insert({
      user_id: newUserId,
      owner_id: targetOwnerId,
      org_id: targetOrgId,
      ghl_user_id: resolvedGhlUserId,
    })
    if (trainerErr) {
      await rollback()
      return serverError('Não foi possível concluir o convite', trainerErr)
    }
  } else {
    const { error: ownerInsertErr } = await admin.from('owners').insert({
      user_id: newUserId,
      org_id: targetOrgId,
      company: org.name,
      plan: 'Starter',
    })
    if (ownerInsertErr) {
      await rollback()
      return serverError('Não foi possível concluir o convite', ownerInsertErr)
    }
  }

  const { data: inviterRow } = await admin
    .from('users')
    .select('name')
    .eq('id', callerId)
    .maybeSingle()
  const inviterName = inviterRow?.name ?? null

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
//   Owner: vê todos da própria org ativa
//   Admin: vê todos; pode filtrar por org via ?orgId=…
//   Filtros opcionais: ?status=pending|accepted, ?role=trainer|owner
//   Busca:     ?q=texto  → ilike em users.name OR users.email
//   Ordenação: ?sort=name|email|role|org|invited_at  &  ?dir=asc|desc
//   Paginação: ?page=1&pageSize=20 (max 100)
//   Lista é montada via memberships (canônica), com user e org resolvidos.

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

type SortKey = 'name' | 'email' | 'role' | 'org' | 'invited_at'
const SORT_KEYS: readonly SortKey[] = ['name', 'email', 'role', 'org', 'invited_at']

interface MembershipRow {
  user_id: string
  org_id: string
  role: 'owner' | 'trainer'
  invite_status: 'pending' | 'accepted'
  invited_by: string | null
  invited_at: string | null
  created_at: string
  users: { id: string; name: string; email: string; avatar: string | null; avatar_color: string | null } | null
  organizations: { id: string; name: string } | null
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const callerRole = session.user.app_metadata?.role as Role | undefined
  const callerId = session.user.id

  if (callerRole !== 'owner' && callerRole !== 'admin') return forbidden()

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status')
  const role = searchParams.get('role')
  const orgIdParam = searchParams.get('orgId')
  const pageRaw = searchParams.get('page')
  const pageSizeRaw = searchParams.get('pageSize')
  const qRaw = searchParams.get('q')
  const sortRaw = searchParams.get('sort')
  const dirRaw = searchParams.get('dir')

  if (status && status !== 'pending' && status !== 'accepted') {
    return badRequest('status inválido')
  }
  if (role && role !== 'trainer' && role !== 'owner') {
    return badRequest('role inválido')
  }
  if (sortRaw && !SORT_KEYS.includes(sortRaw as SortKey)) {
    return badRequest('sort inválido')
  }
  if (dirRaw && dirRaw !== 'asc' && dirRaw !== 'desc') {
    return badRequest('dir inválido')
  }

  const sortKey: SortKey = (sortRaw as SortKey) ?? 'invited_at'
  const ascending = dirRaw === 'asc'

  // Sanitiza q: corta espaços e remove chars que quebrariam a sintaxe do
  // .or() do PostgREST (vírgula separa cláusulas, parens são agrupamento).
  // % e _ continuam permitidos — funcionam como wildcards no ilike, o que
  // é OK pra UX de busca.
  const q = qRaw?.trim().replace(/[,()]/g, '') ?? ''

  const page = Math.max(1, parseInt(pageRaw ?? '1', 10) || 1)
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(pageSizeRaw ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  )
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const admin = createAdminClient()

  // ─── Filtro de busca: resolve user_ids antes de filtrar memberships ─────
  // 2-query approach é mais previsível que .or() com foreignTable, e o set
  // de user_ids é bounded (users globais é da ordem de centenas em prod).
  let searchUserIds: string[] | null = null
  if (q.length > 0) {
    const { data: matchingUsers, error: searchErr } = await admin
      .from('users')
      .select('id')
      .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
    if (searchErr) return serverError('Não foi possível buscar usuários', searchErr)
    searchUserIds = (matchingUsers ?? []).map((u: { id: string }) => u.id)
    if (searchUserIds.length === 0) {
      return ok({ items: [], page: 1, pageSize, total: 0 })
    }
  }

  // memberships tem 2 FKs pra users (user_id e invited_by) — sem o hint
  // !user_id, supabase-js não consegue desambiguar e a query retorna vazia
  // silenciosamente. Forçamos a relação explícita pelo nome da FK column.
  //
  // Ordenação + paginação em JS: PostgREST não ordena o pai por coluna de
  // tabela embed (`?order=users.name.asc` ordena o embed, não o pai). Para
  // sort por name/email/org precisaríamos de uma RPC/view dedicada. Como o
  // dataset é bounded (Owner = sua org; Admin = todas, capado em 1000),
  // puxa tudo e ordena em memória. Quando passar de ~500 memberships totais
  // em prod, migrar pra RPC fica trivial — mantém o shape de resposta igual.
  let query = admin
    .from('memberships')
    .select(`
      user_id, org_id, role, invite_status, invited_by, invited_at, created_at,
      users!user_id (id, name, email, avatar, avatar_color),
      organizations (id, name)
    `)
    .limit(1000)

  if (callerRole === 'owner') {
    const { data: callerUser } = await admin
      .from('users').select('active_org_id').eq('id', callerId).maybeSingle()
    if (!callerUser?.active_org_id) {
      return serverError('Não foi possível identificar a organização do solicitante')
    }
    query = query.eq('org_id', callerUser.active_org_id)
  } else if (orgIdParam) {
    query = query.eq('org_id', orgIdParam)
  }

  if (status) query = query.eq('invite_status', status)
  if (role) query = query.eq('role', role)
  if (searchUserIds) query = query.in('user_id', searchUserIds)

  const { data, error } = await query
  if (error) return serverError('Não foi possível listar os convites', error)

  // ─── Sort em memória ────────────────────────────────────────────────────
  const allRows = (data ?? []) as unknown as MembershipRow[]
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' })
  const dirMul = ascending ? 1 : -1
  const sortValue = (r: MembershipRow): string | number => {
    switch (sortKey) {
      case 'name':       return r.users?.name ?? ''
      case 'email':      return r.users?.email ?? ''
      case 'org':        return r.organizations?.name ?? ''
      case 'role':       return r.role
      case 'invited_at': return r.invited_at ? Date.parse(r.invited_at) : 0
    }
  }
  allRows.sort((a, b) => {
    const av = sortValue(a)
    const bv = sortValue(b)
    let cmp: number
    if (typeof av === 'number' && typeof bv === 'number') {
      cmp = av - bv
    } else {
      cmp = collator.compare(String(av), String(bv))
    }
    if (cmp !== 0) return cmp * dirMul
    // Tie-breaker determinístico — sem isso ordenações com empates
    // (ex: dois trainers com nome igual) ficam não-determinísticas
    // entre requests, com efeito visual em quem aparece em qual página.
    return Date.parse(b.created_at) - Date.parse(a.created_at)
  })

  const total = allRows.length
  const rows = allRows.slice(from, to + 1)
  const inviterIds = Array.from(new Set(rows.map((r) => r.invited_by).filter((v): v is string => !!v)))

  const invitersRes = inviterIds.length > 0
    ? await admin.from('users').select('id, name').in('id', inviterIds)
    : { data: [], error: null }
  if (invitersRes.error) return serverError('Não foi possível resolver os responsáveis', invitersRes.error)

  const inviterById = new Map((invitersRes.data ?? []).map((u) => [u.id, u]))

  // Vínculo GHL por (org, user) — anexado a cada linha para a tabela de
  // membros ativos e o modal de edição. O mesmo user pode ter ghl_user_id
  // diferente por org, então a chave é (org_id, user_id).
  // Resolve as orgs em paralelo (eram N round-trips serializados). Fail-soft:
  // se a lookup de uma org falhar, logamos e seguimos sem o vínculo GHL dela —
  // o badge some pra aquela org, mas a listagem de membros continua de pé (um
  // erro transitório de DB não pode derrubar a página inteira).
  const orgIdsInRows = Array.from(new Set(rows.map((r) => r.org_id)))
  const ghlByOrg = new Map<string, Map<string, string | null>>()
  const ghlResults = await Promise.all(
    orgIdsInRows.map(async (oid) => {
      try {
        return [oid, await dbGetMemberGhlUserIdsByOrg(oid)] as const
      } catch (err) {
        console.error(`[invites] Não foi possível resolver vínculos GHL da org ${oid}`, err)
        return [oid, null] as const
      }
    }),
  )
  for (const [oid, map] of ghlResults) {
    if (map) ghlByOrg.set(oid, map)
  }

  const items = rows.map((r) => ({
    // `id` segue sendo o UUID do user — DELETE /api/invites/[id] espera UUID.
    // Em multi-org o mesmo user_id pode repetir; frontend deve usar
    // `membershipId` como React key (composto user_id:org_id, único por row)
    // e mandar `orgId` como querystring no DELETE quando o caller é admin.
    id: r.user_id,
    membershipId: `${r.user_id}:${r.org_id}`,
    userId: r.user_id,
    orgId: r.org_id,
    name: r.users?.name ?? null,
    email: r.users?.email ?? null,
    role: r.role,
    avatar: r.users?.avatar ?? null,
    avatar_color: r.users?.avatar_color ?? null,
    invited_at: r.invited_at,
    invite_status: r.invite_status,
    created_at: r.created_at,
    org: r.organizations,
    invitedBy: r.invited_by ? inviterById.get(r.invited_by) ?? null : null,
    ghlUserId: ghlByOrg.get(r.org_id)?.get(r.user_id) ?? null,
  }))

  return ok({ items, page, pageSize, total })
}
