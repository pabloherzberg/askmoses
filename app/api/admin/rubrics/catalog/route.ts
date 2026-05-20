import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

interface DbRubricRow {
  id: string
  name: string
  description: string | null
  version: number | null
  is_active: boolean | null
  created_at: string | null
}

interface DbScriptCountRow {
  rubric_id: string
}

// GET /api/admin/rubrics/catalog
//   Lista rubrics disponíveis pro Admin enviar (modo "Rubric" no modal).
//   Quando o Admin escolhe uma rubric e envia, o backend resolve o script
//   mais recente (maior minor_version) dessa rubric e envia ele.
//
//   Inclui scriptCount pra UI mostrar quantos scripts existem na rubric e
//   permitir o Admin ver que pelo menos 1 está disponível antes de tentar.
//
//   Admin only.
export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  const admin = createAdminClient()

  const [rubricsRes, scriptsRes] = await Promise.all([
    admin
      .from('rubrics')
      .select('id, name, description, version, is_active, created_at')
      .order('version', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),
    admin
      .from('scripts')
      .select('rubric_id'),
  ])

  if (rubricsRes.error) {
    console.error('[admin/rubrics/catalog] list rubrics failed', rubricsRes.error)
    return Response.json(
      { data: null, error: { message: 'Não foi possível listar rubrics', code: 500 } },
      { status: 500 },
    )
  }
  if (scriptsRes.error) {
    console.error('[admin/rubrics/catalog] count scripts failed', scriptsRes.error)
    return Response.json(
      { data: null, error: { message: 'Não foi possível contar scripts', code: 500 } },
      { status: 500 },
    )
  }

  // Conta scripts por rubric_id no client — supabase-js não tem groupBy.
  const counts = new Map<string, number>()
  for (const row of (scriptsRes.data ?? []) as DbScriptCountRow[]) {
    counts.set(row.rubric_id, (counts.get(row.rubric_id) ?? 0) + 1)
  }

  return ok(
    ((rubricsRes.data ?? []) as DbRubricRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      version: row.version ?? 1,
      isActive: row.is_active ?? false,
      scriptCount: counts.get(row.id) ?? 0,
      createdAt: row.created_at,
    })),
  )
}
