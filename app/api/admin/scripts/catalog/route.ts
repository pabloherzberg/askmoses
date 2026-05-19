import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

// GET /api/admin/scripts/catalog
//   Lista scripts marcados como is_template=true (catálogo global do Admin).
//   Usado pelo modal de "Send Script" no painel admin pra escolher qual
//   versão enviar pras orgs selecionadas.
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
    .select('id, name, description, rubric_id, rubric_version_snapshot, minor_version, created_at')
    .eq('is_template', true)
    // Ordem natural pra UI: rubric crescente, depois minor crescente.
    .order('rubric_version_snapshot', { ascending: true })
    .order('minor_version', { ascending: true })

  if (error) {
    console.error('[admin/scripts/catalog] list failed', error)
    return Response.json(
      { data: null, error: { message: 'Não foi possível listar scripts', code: 500 } },
      { status: 500 },
    )
  }

  return ok(
    (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      rubricId: row.rubric_id,
      majorVersion: row.rubric_version_snapshot,
      minorVersion: row.minor_version,
      version: `${row.rubric_version_snapshot}.${row.minor_version}`,
      createdAt: row.created_at,
    })),
  )
}
