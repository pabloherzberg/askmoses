import { getOrgId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { DbScript } from '@/lib/db/scripts'

/**
 * Formata o versionamento de 3 partes do script (migration 063).
 * Formato: "v{rubric_version_snapshot}.{minor_version}.{owner_edit_version}".
 * Retorna null quando o script não tem nenhuma das colunas populadas
 * (scripts pré-versionamento, ou onde o backfill não rodou).
 */
export function formatScriptVersion(
  s:
    | Pick<DbScript, 'rubric_version_snapshot' | 'minor_version' | 'owner_edit_version'>
    | null
    | undefined,
): string | null {
  if (!s) return null
  const rubric = s.rubric_version_snapshot
  const minor = s.minor_version
  const ownerEdit = s.owner_edit_version
  // Todas null/undefined → sem versionamento. Pra robustez, exige pelo menos
  // rubric_version_snapshot, que é o segmento "base" criado em 044.
  if (rubric === null || rubric === undefined) return null
  return `v${rubric}.${minor ?? 0}.${ownerEdit ?? 0}`
}

export async function getScripts(filters?: { active?: boolean; rubricId?: string; orgId?: string }) {
  const { dbGetScripts } = await import('@/lib/db/scripts')
  // Resolve orgId from the session if the caller didn't pass one — without
  // it we'd return scripts from every tenant. Returning `[]` when the
  // session has no org is intentional: no leakage on misconfigured users.
  // null = admin sem org → scripts globais; undefined teria retornado todos os tenants
  const orgId: string | null = filters?.orgId ?? (await getOrgId()) ?? null

  // 1) Scripts da org (org_id = X).
  const owned = await dbGetScripts({ orgId, rubricId: filters?.rubricId, active: filters?.active })

  // 2) Templates linkados via org_scripts (status=active|pending). Sem isso,
  // orgs novas — que recebem só um template no signup, sem clonar pra scripts
  // locais — caem com dropdown vazio na tela de upload, mesmo tendo script
  // ativo via org_scripts. Skip pra admin sem org.
  if (!orgId) return owned

  const admin = createAdminClient()
  const { data: links, error: linksErr } = await admin
    .from('org_scripts')
    .select('script_id, status, ended_at')
    .eq('org_id', orgId)
    .is('ended_at', null)
    .in('status', ['active', 'pending'])

  if (linksErr || !links || links.length === 0) return owned

  const linkedIds = links.map((l) => l.script_id as string)
  const ownedIds = new Set(owned.map((s) => s.id))
  const missingIds = linkedIds.filter((id) => !ownedIds.has(id))
  if (missingIds.length === 0) return owned

  let templateQuery = admin.from('scripts').select('*').in('id', missingIds)
  if (filters?.rubricId) templateQuery = templateQuery.eq('rubric_id', filters.rubricId)
  // Não filtra por is_active aqui — o template fica is_active=FALSE no scripts
  // (flag relevante só pra scripts locais); a "atividade" vem do org_scripts.

  const { data: templates } = await templateQuery
  if (!templates) return owned

  return [...owned, ...(templates as DbScript[])]
}
