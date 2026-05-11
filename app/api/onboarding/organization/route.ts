import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

interface CreateOrgBody {
  name?: string
}

const NAME_MIN = 2
const NAME_MAX = 80

function badRequest(message: string) {
  return Response.json(
    { data: null, error: { message, code: 400 } },
    { status: 400 }
  )
}

function conflict(message: string, reason?: string) {
  return Response.json(
    { data: null, error: { message, code: 409, ...(reason ? { reason } : {}) } },
    { status: 409 }
  )
}

function serverError(context: string, err?: unknown) {
  console.error(`[onboarding/organization] ${context}`, err)
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

// Enum `avatar_color` no banco aceita apenas blue/purple/green/red (ver
// invites/route.ts:59). 'amber' existe no tipo TS mas não no enum do
// Supabase — manter fora daqui até migration que adicione o valor.
const AVATAR_COLORS = ['blue', 'purple', 'green', 'red'] as const

function pickAvatarColor(email: string): typeof AVATAR_COLORS[number] {
  let hash = 0
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

// POST /api/onboarding/organization
//   Body: { name: string }   ← nome da org (2-80 chars)
//   Auth: user logado via Supabase Auth, SEM role definida ainda (estado
//     "limbo" pós-signup, pré-onboarding). Owner/trainer/admin já com role
//     recebem 403 — não é caminho de criação adicional de org (Task B
//     trata 2ª org via settings).
//   Cria atomicamente (com rollback manual):
//     organizations → clients (subscription_status='inactive', plan_id=null)
//     → organizations.client_id (1:1) → users → memberships → owners
//     → app_metadata.role='owner'
//   Subscription começa 'inactive' — Owner precisa concluir step-2 do
//   onboarding (POST /api/onboarding/subscribe) pra ativar. Plan gate
//   no resto do app via requireActiveSubscription() / <FeatureGate>.
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const callerId = session.user.id
  const callerRole = session.user.app_metadata?.role as Role | undefined

  // Quem já tem role definida não é candidato a self-service onboarding.
  // Inclui owner existente (que viria pra cá pra criar 2ª org), trainer
  // (sem permissão), e admin (usa /api/organizations).
  if (callerRole) return forbidden()

  let body: CreateOrgBody
  try {
    body = (await request.json()) as CreateOrgBody
  } catch {
    return badRequest('Body inválido')
  }

  const name = body.name?.trim()
  if (!name) return badRequest('name é obrigatório')
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return badRequest(`name deve ter entre ${NAME_MIN} e ${NAME_MAX} caracteres`)
  }

  const admin = createAdminClient()

  // Defesa-em-profundidade: mesmo sem role, se já tem membership ou row em
  // public.users, é estado inconsistente — bloqueia.
  const { count: membershipCount, error: memCountErr } = await admin
    .from('memberships')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', callerId)
  if (memCountErr) return serverError('Não foi possível validar memberships', memCountErr)
  if ((membershipCount ?? 0) > 0) {
    return conflict(
      'Você já está vinculado a uma organização. Para criar outra, fale com o Admin.',
      'ALREADY_HAS_ORG'
    )
  }

  const { data: existingUser, error: existErr } = await admin
    .from('users')
    .select('id')
    .eq('id', callerId)
    .maybeSingle()
  if (existErr) return serverError('Não foi possível validar o usuário', existErr)
  if (existingUser) {
    return conflict(
      'Você já está vinculado a uma organização. Para criar outra, fale com o Admin.',
      'ALREADY_HAS_ORG'
    )
  }

  // Identidade pra public.users: name vem do user_metadata setado no signUp;
  // fallback pra prefixo do email se ausente (caso signup OAuth sem name).
  const email = session.user.email
  if (!email) return serverError('Sessão sem email')
  const userName =
    (session.user.user_metadata?.name as string | undefined)?.trim() ||
    email.split('@')[0] ||
    'Owner'

  // ─── Criação atômica com rollback manual ─────────────────────────────────
  // Sem transação real no supabase-js. Replicamos o padrão de
  // /api/organizations POST (admin): cada step desfaz os anteriores em erro.

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ name })
    .select('id, name')
    .single()
  if (orgErr || !org) return serverError('Não foi possível criar a organização', orgErr)

  const { data: client, error: clientErr } = await admin
    .from('clients')
    .insert({
      name,
      org_id: org.id,
      health: 'healthy',
      subscription_status: 'inactive',
      // plan_id deliberadamente null — Owner escolhe no step-2 do onboarding
    })
    .select('id')
    .single()
  if (clientErr || !client) {
    await admin.from('organizations').delete().eq('id', org.id)
    return serverError('Não foi possível criar o client', clientErr)
  }

  const { error: linkErr } = await admin
    .from('organizations')
    .update({ client_id: client.id })
    .eq('id', org.id)
  if (linkErr) {
    await admin.from('clients').delete().eq('id', client.id)
    await admin.from('organizations').delete().eq('id', org.id)
    return serverError('Não foi possível vincular organização e client', linkErr)
  }

  const { error: userErr } = await admin.from('users').insert({
    id: callerId,
    name: userName,
    email,
    role: 'owner',
    avatar: deriveAvatar(userName),
    avatar_color: pickAvatarColor(email),
    active_org_id: org.id,
    invite_status: 'accepted',
  })
  if (userErr) {
    await admin.from('clients').delete().eq('id', client.id)
    await admin.from('organizations').delete().eq('id', org.id)
    return serverError('Não foi possível criar o usuário', userErr)
  }

  const { error: memErr } = await admin.from('memberships').insert({
    user_id: callerId,
    org_id: org.id,
    role: 'owner',
    invite_status: 'accepted',
    invited_at: new Date().toISOString(),
  })
  if (memErr) {
    await admin.from('users').delete().eq('id', callerId)
    await admin.from('clients').delete().eq('id', client.id)
    await admin.from('organizations').delete().eq('id', org.id)
    return serverError('Não foi possível criar a membership', memErr)
  }

  // owners.plan é text legacy ('Starter' / 'Pro' / 'Pro+RAG') com CHECK NOT NULL
  // (ver 015:173). Setamos 'Starter' por default — fonte canônica do plano é
  // clients.plan_id, esse campo só evita quebrar leituras antigas.
  const { error: ownerErr } = await admin.from('owners').insert({
    user_id: callerId,
    org_id: org.id,
    company: name,
    plan: 'Starter',
  })
  if (ownerErr) {
    await admin.from('memberships').delete().eq('user_id', callerId).eq('org_id', org.id)
    await admin.from('users').delete().eq('id', callerId)
    await admin.from('clients').delete().eq('id', client.id)
    await admin.from('organizations').delete().eq('id', org.id)
    return serverError('Não foi possível criar o owner', ownerErr)
  }

  // app_metadata.role: lido pelo middleware pra rotear por role após login.
  // Setado por último — se falhar, rollback tudo (sem role, próximo login
  // recairia em /onboarding e o user duplicaria a tentativa).
  const { error: metaErr } = await admin.auth.admin.updateUserById(callerId, {
    app_metadata: { ...session.user.app_metadata, role: 'owner' },
  })
  if (metaErr) {
    await admin.from('owners').delete().eq('user_id', callerId).eq('org_id', org.id)
    await admin.from('memberships').delete().eq('user_id', callerId).eq('org_id', org.id)
    await admin.from('users').delete().eq('id', callerId)
    await admin.from('clients').delete().eq('id', client.id)
    await admin.from('organizations').delete().eq('id', org.id)
    return serverError('Não foi possível atualizar a role', metaErr)
  }

  return ok({ id: org.id, name: org.name })
}
