import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

interface ListBody {
  search?: string
  page?: number
  limit?: number
}

interface RpcRow {
  id: string
  name: string
  description: string | null
  rubric_id: string
  rubric_name: string | null
  major_version: number
  minor_version: number
  sections_count: number
  criteria_count: number
  created_at: string
  total: number | string
}

function badRequest(message: string) {
  return Response.json(
    { data: null, error: { message, code: 400 } },
    { status: 400 },
  )
}

// POST /api/admin/scripts/list
//   Body: { search?, page?, limit? }
//   Listagem paginada da tabela de scripts pro SAAS Panel (aba Scripts).
//   Busca via RPC list_admin_scripts — bate em name/description/versão/sections.
//
//   Admin only.
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

  const page = typeof body.page === 'number' && body.page > 0 ? Math.floor(body.page) : 1
  const limit =
    typeof body.limit === 'number' && body.limit > 0 && body.limit <= 200
      ? Math.floor(body.limit)
      : 25
  const search =
    typeof body.search === 'string' && body.search.trim().length > 0
      ? body.search.trim().slice(0, 200)
      : null

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('list_admin_scripts', {
    p_search: search,
    p_page: page,
    p_limit: limit,
  })

  if (error) {
    console.error('[admin/scripts/list] rpc failed', error)
    return Response.json(
      { data: null, error: { message: 'Erro interno', code: 500 } },
      { status: 500 },
    )
  }

  const rows = (data ?? []) as RpcRow[]
  const total = rows.length > 0 ? Number(rows[0].total) : 0

  return ok({
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      rubricId: r.rubric_id,
      rubricName: r.rubric_name ?? null,
      version: `${r.major_version}.${r.minor_version}`,
      sectionsCount: r.sections_count,
      criteriaCount: r.criteria_count,
      createdAt: r.created_at,
    })),
    total,
    page,
    limit,
  })
}
