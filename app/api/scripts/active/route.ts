import { getActiveOrgContext, ok, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/scripts/active
//
//   Retorna o script ativo da org da sessão com suas sections completas.
//   Usado pela tela de insights para exibir o script atual do owner e
//   para comparar com sugestões pendentes do admin.
export async function GET() {
  const ctx = await getActiveOrgContext()
  if (!ctx) return unauthorized()
  if (!ctx.activeOrgId) return ok({ script: null })

  const admin = createAdminClient()

  // Fonte de verdade: org_scripts status='active'. Fallback para scripts.is_active=true
  // para orgs que ainda não passaram pelo fluxo de send/accept do admin.
  const { data: orgScriptRow, error: osErr } = await admin
    .from('org_scripts')
    .select('script_id')
    .eq('org_id', ctx.activeOrgId)
    .eq('status', 'active')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (osErr) {
    console.error('[scripts/active] org_scripts fetch failed:', osErr)
    return Response.json(
      { data: null, error: { message: 'Erro ao buscar script ativo', code: 500 } },
      { status: 500 },
    )
  }

  const scriptId = orgScriptRow?.script_id as string | null | undefined

  // Fallback: org sem linha em org_scripts ainda usa scripts.is_active=true
  const cols =
    'id, name, description, sections, full_script, criteria, is_active, created_at, updated_at, rubric_version_snapshot, minor_version'
  const query = scriptId
    ? admin
        .from('scripts')
        .select(cols)
        .eq('id', scriptId)
        .maybeSingle()
    : admin
        .from('scripts')
        .select(cols)
        .eq('org_id', ctx.activeOrgId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

  const { data: script, error } = await query

  if (error) {
    console.error('[scripts/active] script fetch failed:', error)
    return Response.json(
      { data: null, error: { message: 'Erro ao buscar script ativo', code: 500 } },
      { status: 500 },
    )
  }

  // Versão derivada igual ao /api/scripts/pending: rubric_version_snapshot.minor_version.
  const withVersion = script
    ? { ...script, version: `${script.rubric_version_snapshot}.${script.minor_version}` }
    : null

  return ok({ script: withVersion })
}
