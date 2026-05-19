import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

interface DbRubricNested {
  id: string
  name: string
  version: number | null
}

interface DbScriptRow {
  id: string
  name: string
  description: string | null
  rubric_id: string
  rubric_version_snapshot: number | null
  minor_version: number | null
  created_at: string
  rubrics: DbRubricNested | DbRubricNested[] | null
}

// GET /api/admin/scripts/catalog
//   Lista TODOS os scripts existentes — Admin pode enviar qualquer script
//   (template do catálogo ou criado via script-builder) pra qualquer org.
//   Inclui rubric.name e rubric.version pra UI agrupar/filtrar.
//
//   Admin only.
export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('scripts')
    .select('id, name, description, rubric_id, rubric_version_snapshot, minor_version, created_at, rubrics(id, name, version)')
    // Ordem natural: rubric primeiro (pra agrupar visualmente), depois
    // versão crescente.
    .order('rubric_id', { ascending: true })
    .order('rubric_version_snapshot', { ascending: true, nullsFirst: false })
    .order('minor_version', { ascending: true, nullsFirst: false })

  if (error) {
    console.error('[admin/scripts/catalog] list failed', error)
    return Response.json(
      { data: null, error: { message: 'Não foi possível listar scripts', code: 500 } },
      { status: 500 },
    )
  }

  const rows = (data ?? []) as unknown as DbScriptRow[]
  return ok(
    rows.map((row) => {
      // rubrics pode vir como objeto ou array dependendo do schema gerado;
      // normaliza pra objeto.
      const rubricRaw = row.rubrics
      const rubric = Array.isArray(rubricRaw) ? rubricRaw[0] ?? null : rubricRaw
      const major = row.rubric_version_snapshot ?? 1
      const minor = row.minor_version ?? 0
      return {
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        rubricId: row.rubric_id,
        rubricName: rubric?.name ?? null,
        rubricVersion: rubric?.version ?? null,
        majorVersion: major,
        minorVersion: minor,
        version: `${major}.${minor}`,
        createdAt: row.created_at,
      }
    }),
  )
}
