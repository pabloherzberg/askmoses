import { getActiveOrgContext } from '@/lib/auth'
import { dbGetScriptGaps, type DbScriptGap } from '@/lib/db/script-gaps'
import type { ScriptGap, ScriptGapAnalysis } from '@/lib/types'

function toScriptGap(row: DbScriptGap): ScriptGap {
  return {
    id: row.id,
    section: row.section,
    scriptInstruction: row.script_instruction,
    observedPattern: row.observed_pattern,
    frequency: row.frequency,
    severity: row.severity,
    suggestedFix: row.suggested_fix,
  }
}

/**
 * Análise de Script Gap da org ativa. Server-only: o dashboard (server
 * component) chama isto direto, como já faz com computeRubricGaps. Retorna
 * null quando não há org na sessão ou quando não há gaps pendentes.
 *
 * analyzedAt = análise mais recente entre os gaps; callsAnalyzed = união dos
 * call IDs analisados (a análise cobre o mesmo conjunto de calls, mas unimos
 * defensivamente caso venham de lotes distintos).
 */
export async function getScriptGaps(): Promise<ScriptGapAnalysis | null> {
  const ctx = await getActiveOrgContext()
  if (!ctx?.activeOrgId) return null

  const rows = await dbGetScriptGaps(ctx.activeOrgId)
  if (rows.length === 0) return null

  const analyzedAt = rows.reduce(
    (latest, r) => (r.analyzed_at > latest ? r.analyzed_at : latest),
    rows[0].analyzed_at,
  )

  const callsAnalyzed = [...new Set(rows.flatMap((r) => r.calls_analyzed ?? []))]

  return {
    analyzedAt,
    callsAnalyzed,
    gaps: rows.map(toScriptGap),
  }
}
