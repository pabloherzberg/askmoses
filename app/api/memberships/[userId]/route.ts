import { type NextRequest } from 'next/server'
import {
  getSession,
  ok,
  unauthorized,
  forbidden,
  notFound,
  requireOwnerWrite,
  getOrgId,
} from '@/lib/auth'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { createAdminClient } from '@/lib/supabase/admin'
import { dbSetTrainerGhlUserId, dbUpsertOwnerCallProfile } from '@/lib/db/trainers'
import {
  resolveGhlUserForOrg,
  GhlLinkValidationError,
  ghlLinkErrorResponse,
} from '@/lib/services/ghl-user-link'
import type { Role } from '@/lib/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(message: string) {
  return Response.json({ data: null, error: { message, code: 400 } }, { status: 400 })
}

function conflict(message: string) {
  return Response.json({ data: null, error: { message, code: 409 } }, { status: 409 })
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
  // Owner: usa o contexto de org ativo memoizado (getOrgId — impersonation-aware,
  // 1 RPC compartilhada com o resto da request). Admin: precisa de ?orgId.
  let orgId: string
  if (callerRole === 'owner') {
    const activeOrgId = await getOrgId()
    if (!activeOrgId) {
      return serverError('Não foi possível identificar a organização do solicitante')
    }
    orgId = activeOrgId
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
  // excludeUserId = userId: o próprio membro mantém o vínculo atual sem
  // colidir com a checagem de unicidade.
  if (ghlUserId !== null) {
    try {
      await resolveGhlUserForOrg(orgId, ghlUserId, userId)
    } catch (err) {
      if (err instanceof GhlLinkValidationError) return ghlLinkErrorResponse(err)
      return serverError('Não foi possível validar o vínculo GHL', err)
    }
  }

  // ─── Grava ───────────────────────────────────────────────────────────────
  // Trainer: atualiza a linha existente. Owner: ativar = upsert da linha de
  // "perfil de calls" (cria com owner_id = ele mesmo); limpar = só zera o ghl
  // da linha se ela existir (no-op se nunca foi ativado). A linha NÃO é
  // deletada — preserva histórico de calls (calls.trainer_id ON DELETE SET NULL).
  try {
    if (memberRole === 'owner') {
      if (ghlUserId !== null) {
        await dbUpsertOwnerCallProfile(orgId, userId, ghlUserId)
      } else {
        await dbSetTrainerGhlUserId(orgId, userId, null)
      }
    } else {
      const updated = await dbSetTrainerGhlUserId(orgId, userId, ghlUserId)
      if (!updated) return notFound('Membro')
    }
  } catch (err) {
    // Violação de unicidade (race) vira 409 amigável.
    const msg = (err as { message?: string }).message ?? ''
    if (msg.includes('uidx') || msg.includes('duplicate')) {
      return conflict('Este usuário do GHL já está vinculado a outro membro desta organização')
    }
    return serverError('Não foi possível atualizar o vínculo GHL', err)
  }

  return ok({ userId, orgId, role: memberRole, ghlUserId })
}
