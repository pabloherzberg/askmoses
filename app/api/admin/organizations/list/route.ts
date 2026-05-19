import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { getClientsPage } from '@/lib/services/clients'
import type { OrgScriptStatus, PlanCode } from '@/lib/types'
import type { Role } from '@/lib/types'

interface ListBody {
  search?: string
  planCode?: PlanCode
  planStatus?: 'active' | 'inactive' | 'trial'
  scriptStatus?: OrgScriptStatus
  scriptVersion?: string
  mrrMin?: number
  mrrMax?: number
  lastActivityFrom?: string
  lastActivityTo?: string
  page?: number
  limit?: number
}

const VALID_PLAN_CODES: PlanCode[] = ['starter', 'pro', 'pro_rag']
const VALID_PLAN_STATUSES = ['active', 'inactive', 'trial'] as const
const VALID_SCRIPT_STATUSES: OrgScriptStatus[] = ['none', 'pending', 'active', 'deprecated', 'rejected']

function badRequest(message: string) {
  return Response.json(
    { data: null, error: { message, code: 400 } },
    { status: 400 },
  )
}

// POST /api/admin/organizations/list
//   Body: { filtros, page, limit }
//   Listagem paginada + filtrada de orgs. Substitui o GET /api/clients
//   (legacy) que carregava tudo. Body em vez de query string pra suportar
//   filtros complexos (datas, ranges) sem encoding manual.
//
//   Admin only. Sem rate-limit explícito — é read-only e o frontend já
//   debounce a busca.
export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  let body: ListBody
  try {
    body = (await request.json()) as ListBody
  } catch {
    return badRequest('Body inválido')
  }

  // Sanitize cada campo — inputs inválidos ignorados (não filtra) em vez
  // de barrar a request, pra ser tolerante ao frontend.
  const page = typeof body.page === 'number' && body.page > 0 ? Math.floor(body.page) : 1
  const limit =
    typeof body.limit === 'number' && body.limit > 0 && body.limit <= 200
      ? Math.floor(body.limit)
      : 25

  const search = typeof body.search === 'string' && body.search.trim().length > 0
    ? body.search.trim().slice(0, 200)
    : undefined

  const planCode =
    body.planCode && VALID_PLAN_CODES.includes(body.planCode) ? body.planCode : undefined

  const planStatus =
    body.planStatus && (VALID_PLAN_STATUSES as readonly string[]).includes(body.planStatus)
      ? body.planStatus
      : undefined

  const scriptStatus =
    body.scriptStatus && VALID_SCRIPT_STATUSES.includes(body.scriptStatus)
      ? body.scriptStatus
      : undefined

  const scriptVersion =
    typeof body.scriptVersion === 'string' && /^\d+(\.\d+)?$/.test(body.scriptVersion)
      ? body.scriptVersion
      : undefined

  const mrrMin =
    typeof body.mrrMin === 'number' && isFinite(body.mrrMin) && body.mrrMin >= 0
      ? body.mrrMin
      : undefined
  const mrrMax =
    typeof body.mrrMax === 'number' && isFinite(body.mrrMax) && body.mrrMax >= 0
      ? body.mrrMax
      : undefined

  // Datas devem ser ISO parseable. Inválidas → ignora silenciosamente.
  const lastActivityFrom = body.lastActivityFrom
    ? (() => {
        const d = new Date(body.lastActivityFrom!)
        return isNaN(d.getTime()) ? undefined : d.toISOString()
      })()
    : undefined
  const lastActivityTo = body.lastActivityTo
    ? (() => {
        const d = new Date(body.lastActivityTo!)
        if (isNaN(d.getTime())) return undefined
        // Inclusivo até final do dia se vier só com YYYY-MM-DD.
        if (body.lastActivityTo!.length === 10) d.setHours(23, 59, 59, 999)
        return d.toISOString()
      })()
    : undefined

  try {
    const result = await getClientsPage({
      search,
      planCode,
      planStatus,
      scriptStatus,
      scriptVersion,
      mrrMin,
      mrrMax,
      lastActivityFrom,
      lastActivityTo,
      page,
      limit,
    })
    return ok(result)
  } catch (err) {
    console.error('[admin/organizations/list] query failed', err)
    return Response.json(
      { data: null, error: { message: 'Erro interno', code: 500 } },
      { status: 500 },
    )
  }
}
