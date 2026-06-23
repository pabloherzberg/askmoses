import { type NextRequest } from 'next/server'
import {
  getSession,
  ok,
  unauthorized,
  forbidden,
  notFound,
  requireOwnerWrite,
} from '@/lib/auth'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { createAdminClient } from '@/lib/supabase/admin'
import { dbGetOrgGhlConfigByOrgId } from '@/lib/db/organizations'
import { dbGetLinkedGhlUserIds, dbSetMemberGhlUserId } from '@/lib/db/trainers'
import { fetchGhlUsers, GhlAuthError } from '@/lib/services/ghl-api'
import type { Role } from '@/lib/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(message: string) {
  return Response.json({ data: null, error: { message, code: 400 } }, { status: 400 })
}

function conflict(message: string) {
  return Response.json({ data: null, error: { message, code: 409 } }, { status: 409 })
}

function upstreamError(message: string) {
  return Response.json({ data: null, error: { message, code: 502 } }, { status: 502 })
}

function serverError(context: string, err?: unknown) {
  console.error(`[memberships] ${context}`, err)
  return Response.json({ data: null, error: { message: 'Erro interno', code: 500 } }, { status: 500 })
}

interface PatchBody {
  // string = vincular a esse usuário do GHL; null = limpar o vínculo.
  ghlUserId?: string | null
}

// PATCH /api/memberships/[userId]?orgId=
//   Edita o vínculo GHL de um membro ativo (trainer/owner) de uma org.
//   - Owner: age só na própria org ativa (orgId divergente = 403).
//   - Admin: precisa de ?orgId.
//   Body: { ghlUserId: string | null }. Valida o usuário na API do GHL e a
//   unicidade dentro da org (exceto o próprio membro, que mantém o atual).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return unauthorized()

  // Mesma guarda do POST /api/invites: admin impersonando não opera em org alheia.
  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const callerRole = session.user.app_metadata?.role as Role | undefined
  if (callerRole !== 'owner' && callerRole !== 'admin') return forbidden()

  const { userId } = await params
  if (!userId || !UUID_RE.test(userId)) return badRequest('userId inválido')

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return badRequest('Body inválido')
  }

  const ghlUserId =
    body.ghlUserId === null || body.ghlUserId === undefined
      ? null
      : String(body.ghlUserId).trim() || null

  const admin = createAdminClient()
  const orgIdParam = request.nextUrl.searchParams.get('orgId')?.trim() || null

  // ─── Resolve a org alvo ──────────────────────────────────────────────────
  let orgId: string
  if (callerRole === 'owner') {
    const { data: callerUser } = await admin
      .from('users')
      .select('active_org_id')
      .eq('id', session.user.id)
      .maybeSingle()
    if (!callerUser?.active_org_id) {
      return serverError('Não foi possível identificar a organização do solicitante')
    }
    orgId = callerUser.active_org_id
    if (orgIdParam && orgIdParam !== orgId) return forbidden()
  } else {
    if (!orgIdParam || !UUID_RE.test(orgIdParam)) return badRequest('orgId é obrigatório')
    orgId = orgIdParam
  }

  // ─── Membership alvo existe? Qual o papel? ───────────────────────────────
  const { data: membership, error: memErr } = await admin
    .from('memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (memErr) return serverError('Não foi possível carregar o membro', memErr)
  if (!membership) return notFound('Membro')

  const memberRole = membership.role as 'trainer' | 'owner'

  // ─── Valida o ghlUserId contra o GHL (quando não for limpar) ─────────────
  if (ghlUserId !== null) {
    let config
    try {
      config = await dbGetOrgGhlConfigByOrgId(orgId)
    } catch (err) {
      return serverError('Não foi possível carregar a config GHL', err)
    }
    if (!config) {
      return badRequest('Integração GHL não configurada para esta organização')
    }

    let linked: string[]
    try {
      linked = await dbGetLinkedGhlUserIds(orgId, userId)
    } catch (err) {
      return serverError('Não foi possível verificar vínculos GHL existentes', err)
    }
    if (linked.includes(ghlUserId)) {
      return conflict('Este usuário do GHL já está vinculado a outro membro desta organização')
    }

    let ghlUsers
    try {
      ghlUsers = await fetchGhlUsers(config.locationId, config.accessToken)
    } catch (err) {
      if (err instanceof GhlAuthError) {
        return upstreamError('Não foi possível autenticar no GHL — verifique o token da integração')
      }
      return upstreamError('Não foi possível carregar os usuários do GHL')
    }
    if (!ghlUsers.some((u) => u.id === ghlUserId)) {
      return badRequest('Usuário do GHL inválido para esta organização')
    }
  }

  // ─── Grava ───────────────────────────────────────────────────────────────
  let updated: boolean
  try {
    updated = await dbSetMemberGhlUserId(orgId, userId, memberRole, ghlUserId)
  } catch (err) {
    // Violação de unicidade (race) vira 409 amigável.
    const msg = (err as { message?: string }).message ?? ''
    if (msg.includes('uidx') || msg.includes('duplicate')) {
      return conflict('Este usuário do GHL já está vinculado a outro membro desta organização')
    }
    return serverError('Não foi possível atualizar o vínculo GHL', err)
  }
  if (!updated) return notFound('Membro')

  return ok({ userId, orgId, role: memberRole, ghlUserId })
}
