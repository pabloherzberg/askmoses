import { createAdminClient } from '@/lib/supabase/admin'

export interface DbScriptGap {
  id: string
  org_id: string
  section: string
  script_instruction: string
  observed_pattern: string
  frequency: number
  severity: 'high' | 'medium' | 'low'
  suggested_fix: string
  calls_analyzed: string[]
  analyzed_at: string
  accepted_at: string | null
  created_at: string
}

// Ordena por severity (high → low) e depois por frequência desc, para que os
// atritos mais graves e recorrentes apareçam primeiro no dashboard.
const SEVERITY_RANK: Record<DbScriptGap['severity'], number> = {
  high: 0,
  medium: 1,
  low: 2,
}

export async function dbGetScriptGaps(
  orgId: string,
  opts?: { includeAccepted?: boolean },
): Promise<DbScriptGap[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('script_gaps')
    .select('*')
    .eq('org_id', orgId)

  // Por padrão só os pendentes — gaps já aceitos saem da lista do dashboard.
  if (!opts?.includeAccepted) query = query.is('accepted_at', null)

  const { data, error } = await query

  if (error) throw new Error(`dbGetScriptGaps: ${error.message}`)

  const rows = (data ?? []) as DbScriptGap[]
  return rows.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (sev !== 0) return sev
    return b.frequency - a.frequency
  })
}

export interface NewScriptGap {
  section: string
  script_instruction: string
  observed_pattern: string
  frequency: number
  severity: 'high' | 'medium' | 'low'
  suggested_fix: string
  calls_analyzed: string[]
}

/**
 * Substitui os gaps PENDENTES da org pelos recém-gerados, preservando os já
 * aceitos (accepted_at preenchido = histórico de reescritas que o owner aplicou).
 * Uma nova análise é uma nova "foto" do atrito atual, então os pendentes antigos
 * são descartados; os aceitos ficam como registro do que já foi tratado.
 */
export async function dbReplacePendingScriptGaps(
  orgId: string,
  gaps: NewScriptGap[],
): Promise<DbScriptGap[]> {
  const supabase = createAdminClient()
  const analyzedAt = new Date().toISOString()

  const { error: delErr } = await supabase
    .from('script_gaps')
    .delete()
    .eq('org_id', orgId)
    .is('accepted_at', null)

  if (delErr) throw new Error(`dbReplacePendingScriptGaps (delete): ${delErr.message}`)

  if (gaps.length === 0) return []

  const rows = gaps.map((g) => ({
    org_id: orgId,
    section: g.section,
    script_instruction: g.script_instruction,
    observed_pattern: g.observed_pattern,
    frequency: g.frequency,
    severity: g.severity,
    suggested_fix: g.suggested_fix,
    calls_analyzed: g.calls_analyzed,
    analyzed_at: analyzedAt,
  }))

  const { data, error } = await supabase
    .from('script_gaps')
    .insert(rows)
    .select()

  if (error) throw new Error(`dbReplacePendingScriptGaps (insert): ${error.message}`)

  return (data ?? []) as DbScriptGap[]
}

/**
 * Marca um gap como aceito (accepted_at = now). O `orgId` é defense-in-depth —
 * createAdminClient() bypassa RLS, então filtramos por org_id no UPDATE para
 * impedir que um owner aceite gap de outra org. Retorna null se nada casar.
 */
export async function dbAcceptScriptGap(
  id: string,
  orgId: string,
): Promise<DbScriptGap | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('script_gaps')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .maybeSingle()

  if (error) throw new Error(`dbAcceptScriptGap: ${error.message}`)

  return (data ?? null) as DbScriptGap | null
}
