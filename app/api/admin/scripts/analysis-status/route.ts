import { getSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { forbidden, unauthorized } from '@/lib/auth'
import type { Role } from '@/lib/types'

export interface AnalysisStatusItem {
  orgScriptId: string
  orgId: string
  orgName: string
  scriptName: string
  analysis_status: 'processing' | 'ready' | 'error'
  updatedAt: string
}

// GET /api/admin/scripts/analysis-status
// Retorna as análises de IA em andamento ou recentes (processando).
// Só acessível por admin.
export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  const admin = createAdminClient()

  // Busca todas as linhas de cache com status 'processing'
  const { data: cacheRows, error } = await admin
    .from('script_intelligence_cache')
    .select('org_script_id, org_id, analysis_status, updated_at')
    .eq('analysis_status', 'processing')
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[analysis-status] fetch failed:', error)
    return Response.json({ data: { items: [] }, error: null })
  }

  if (!cacheRows || cacheRows.length === 0) {
    return Response.json({ data: { items: [] }, error: null })
  }

  // Enriquece com nome da org e nome do script via org_scripts + scripts + organizations
  const orgScriptIds = cacheRows.map((r: { org_script_id: string }) => r.org_script_id)

  const { data: orgScriptRows } = await admin
    .from('org_scripts')
    .select('id, script_id, org_id')
    .in('id', orgScriptIds)

  const scriptIds = [...new Set((orgScriptRows ?? []).map((r: { script_id: string }) => r.script_id))]
  const orgIds = [...new Set((orgScriptRows ?? []).map((r: { org_id: string }) => r.org_id))]

  const [{ data: scripts }, { data: orgs }] = await Promise.all([
    admin.from('scripts').select('id, name').in('id', scriptIds),
    admin.from('organizations').select('id, name').in('id', orgIds),
  ])

  const scriptMap = Object.fromEntries((scripts ?? []).map((s: { id: string; name: string }) => [s.id, s.name]))
  const orgMap = Object.fromEntries((orgs ?? []).map((o: { id: string; name: string }) => [o.id, o.name]))
  const orgScriptMap = Object.fromEntries(
    (orgScriptRows ?? []).map((r: { id: string; script_id: string; org_id: string }) => [r.id, r])
  )

  const items: AnalysisStatusItem[] = cacheRows.map((row: { org_script_id: string; org_id: string; analysis_status: 'processing' | 'ready' | 'error'; updated_at: string }) => {
    const orgScript = orgScriptMap[row.org_script_id] as { id: string; script_id: string; org_id: string } | undefined
    return {
      orgScriptId: row.org_script_id,
      orgId: row.org_id,
      orgName: orgMap[row.org_id] ?? 'Org desconhecida',
      scriptName: orgScript ? (scriptMap[orgScript.script_id] ?? 'Script desconhecido') : 'Script desconhecido',
      analysis_status: row.analysis_status,
      updatedAt: row.updated_at,
    }
  })

  return Response.json({ data: { items }, error: null })
}
