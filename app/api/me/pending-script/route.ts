import { getSession, ok, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

interface DbOrgScriptCurrentRow {
  script_id: string
  script_name: string
  rubric_version_snapshot: number | null
  minor_version: number | null
  started_at: string | null
  effective_status: 'pending' | 'active' | 'deprecated' | 'rejected'
}

// GET /api/me/pending-script
//   Retorna se o user (owner) tem um script aguardando aprovação na sua
//   org ativa. Trainer/Admin sempre recebem { pending: false } — só
//   Owner aciona o fluxo de approval.
//
//   Usado pelo badge no AppHeader pra notificar o Owner que existe um
//   script pendente.
export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  // Só owners têm aprovações pendentes. Admin/trainer respondem com false
  // mesmo se a org dele/dela tiver pending — não é responsabilidade deles.
  if (role !== 'owner') {
    return ok({ pending: false, version: null, scriptName: null })
  }

  const admin = createAdminClient()

  // Resolve active_org_id do user.
  const { data: userRow, error: userErr } = await admin
    .from('users')
    .select('active_org_id')
    .eq('id', session.user.id)
    .maybeSingle()
  if (userErr) {
    console.error('[me/pending-script] failed to load user', userErr)
    return ok({ pending: false, version: null, scriptName: null })
  }
  const activeOrgId = (userRow as { active_org_id: string | null } | null)?.active_org_id
  if (!activeOrgId) {
    return ok({ pending: false, version: null, scriptName: null })
  }

  // Consulta a view org_scripts_current (migration 044) que já trás script
  // name + version + effective_status.
  const { data, error } = await admin
    .from('org_scripts_current')
    .select('script_id, script_name, rubric_version_snapshot, minor_version, started_at, effective_status')
    .eq('org_id', activeOrgId)
    .eq('effective_status', 'pending')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    // 42P01 = view não existe (migration 044 não rodou) — silencioso pro
    // badge não quebrar o header em ambientes sem a migration.
    if (error.code === '42P01' || error.code === 'PGRST116') {
      return ok({ pending: false, version: null, scriptName: null })
    }
    console.error('[me/pending-script] query failed', error)
    return ok({ pending: false, version: null, scriptName: null })
  }
  if (!data) {
    return ok({ pending: false, version: null, scriptName: null })
  }

  const row = data as DbOrgScriptCurrentRow
  const major = row.rubric_version_snapshot ?? 1
  const minor = row.minor_version ?? 0

  return ok({
    pending: true,
    version: `${major}.${minor}`,
    scriptName: row.script_name,
  })
}
