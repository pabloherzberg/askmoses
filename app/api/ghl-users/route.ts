import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { dbGetOrgGhlConfigByOrgId } from '@/lib/db/organizations'
import { dbGetLinkedGhlUserIds } from '@/lib/db/trainers'
import { fetchGhlUsers, GhlAuthError } from '@/lib/services/ghl-api'
import type { Role } from '@/lib/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(message: string) {
  return Response.json({ data: null, error: { message, code: 400 } }, { status: 400 })
}

// 409 = a org existe mas não tem a integração GHL habilitada. A UI usa esse
// código pra bloquear a criação de vendedor e pedir pra configurar o GHL.
function ghlNotConfigured() {
  return Response.json(
    { data: null, error: { message: 'Integração GHL não configurada para esta organização', code: 409 } },
    { status: 409 },
  )
}

function upstreamError(message: string) {
  return Response.json({ data: null, error: { message, code: 502 } }, { status: 502 })
}

function serverError(context: string, err?: unknown) {
  console.error(`[ghl-users] ${context}`, err)
  return Response.json({ data: null, error: { message: 'Erro interno', code: 500 } }, { status: 500 })
}

// GET /api/ghl-users?orgId=&includeGhlUserId=
//   Lista os usuários do GHL da org que ainda NÃO estão vinculados a um
//   membro (trainer/owner) dela — candidatos a virar vendedor.
//   - Owner: usa sempre a própria org ativa (ignora orgId divergente).
//   - Admin: precisa de ?orgId.
//   - includeGhlUserId: mantém esse usuário na lista mesmo já vinculado —
//     usado na edição, pra o membro continuar enxergando o vínculo atual.
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const callerRole = session.user.app_metadata?.role as Role | undefined
  if (callerRole !== 'owner' && callerRole !== 'admin') return forbidden()

  const { searchParams } = request.nextUrl
  const orgIdParam = searchParams.get('orgId')?.trim() || null
  const includeGhlUserId = searchParams.get('includeGhlUserId')?.trim() || null

  const admin = createAdminClient()

  // ─── Resolve a org alvo conforme o papel ────────────────────────────────
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
    // Owner não pode listar usuários GHL de outra org.
    if (orgIdParam && orgIdParam !== orgId) return forbidden()
  } else {
    if (!orgIdParam || !UUID_RE.test(orgIdParam)) return badRequest('orgId é obrigatório')
    orgId = orgIdParam
  }

  // ─── Credenciais GHL da org ─────────────────────────────────────────────
  let config
  try {
    config = await dbGetOrgGhlConfigByOrgId(orgId)
  } catch (err) {
    return serverError('Falha ao carregar config GHL', err)
  }
  if (!config) return ghlNotConfigured()

  // ─── Busca usuários no GHL + filtra os já vinculados ────────────────────
  let ghlUsers
  try {
    ghlUsers = await fetchGhlUsers(config.locationId, config.accessToken)
  } catch (err) {
    if (err instanceof GhlAuthError) {
      return upstreamError('Não foi possível autenticar no GHL — verifique o token da integração')
    }
    return upstreamError('Não foi possível carregar os usuários do GHL')
  }

  let linked: Set<string>
  try {
    linked = new Set(await dbGetLinkedGhlUserIds(orgId))
  } catch (err) {
    return serverError('Falha ao verificar vínculos existentes', err)
  }

  const available = ghlUsers.filter(
    (u) => !linked.has(u.id) || u.id === includeGhlUserId,
  )

  return ok({ users: available })
}
