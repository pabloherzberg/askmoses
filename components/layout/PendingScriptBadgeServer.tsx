import { AlertCircle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth'
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

// PendingScriptBadgeServer
//   Async server component. Fetcha o status direto via createAdminClient
//   (sem roundtrip via API route) e renderiza um chip amber quando o Owner
//   tem um script pending. Para admin/trainer retorna null.
//
//   Por ser server, o badge é hidratado uma vez por request — não há
//   re-fetch a cada navegação como na versão client. Quando o Owner aceitar
//   o script (fluxo futuro), o page refresh / router.refresh() força nova
//   busca.
export async function PendingScriptBadgeServer() {
  const session = await getSession()
  if (!session) return null

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'owner') return null

  const admin = createAdminClient()

  const { data: userRow, error: userErr } = await admin
    .from('users')
    .select('active_org_id')
    .eq('id', session.user.id)
    .maybeSingle()
  if (userErr || !userRow) return null

  const activeOrgId = (userRow as { active_org_id: string | null }).active_org_id
  if (!activeOrgId) return null

  const { data, error } = await admin
    .from('org_scripts_current')
    .select('script_id, script_name, rubric_version_snapshot, minor_version, started_at, effective_status')
    .eq('org_id', activeOrgId)
    .eq('effective_status', 'pending')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  const row = data as DbOrgScriptCurrentRow
  const major = row.rubric_version_snapshot ?? 1
  const minor = row.minor_version ?? 0
  const version = `${major}.${minor}`

  const t = await getTranslations('Shared.header')
  const label = t('pendingApprovalShort')
  const tooltip = row.script_name
    ? `${row.script_name} v${version} ${label}`
    : label

  return (
    <span
      className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium"
      title={tooltip}
      style={{
        background: 'var(--am-amber-bg)',
        borderColor: 'var(--am-amber)',
        color: 'var(--am-amber)',
      }}
    >
      <AlertCircle size={12} />
      v{version}
      <span className="font-mono uppercase tracking-wide text-[10px]">
        {label}
      </span>
    </span>
  )
}
