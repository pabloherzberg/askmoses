import { getActiveOrgContext } from '@/lib/auth'
import { dbGetScriptGaps, dbReplacePendingScriptGaps, type DbScriptGap } from '@/lib/db/script-gaps'
import { dbGetLatestScriptGapRun, dbInsertScriptGapRun } from '@/lib/db/script-gap-runs'
import { runScriptGapDetection } from '@/lib/script-gap/analyze'
import type { ScriptGap, ScriptGapAnalysis } from '@/lib/types'

// Stale-while-serving: uma análise vale 7 dias. Ao visitar o dashboard, se a
// última run for mais velha que isso (ou não existir), dispara uma nova análise
// automática; caso contrário serve o cache. Mesmo padrão do Marketing
// Intelligence (lib/services/marketing-intelligence.ts).
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

function isStale(lastRunISO: string): boolean {
  return Date.now() - new Date(lastRunISO).getTime() > STALE_AFTER_MS
}

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

// Monta o ScriptGapAnalysis a partir dos gaps pendentes persistidos.
// analyzedAt prefere a data da run (mesmo quando 0 gaps); senão usa o
// analyzed_at mais recente entre os gaps.
async function buildAnalysisFromDb(
  orgId: string,
  ranAtFallback: string | null,
): Promise<ScriptGapAnalysis | null> {
  const rows = await dbGetScriptGaps(orgId)
  const analyzedAt =
    ranAtFallback ??
    (rows.length > 0
      ? rows.reduce((latest, r) => (r.analyzed_at > latest ? r.analyzed_at : latest), rows[0].analyzed_at)
      : null)

  if (!analyzedAt) return null

  const callsAnalyzed = [...new Set(rows.flatMap((r) => r.calls_analyzed ?? []))]

  return {
    analyzedAt,
    callsAnalyzed,
    gaps: rows.map(toScriptGap),
  }
}

/**
 * Executa a detecção de gaps via IA, persiste o resultado (substitui os gaps
 * pendentes, preserva os aceitos) e registra a run (sempre, mesmo com 0 gaps —
 * a run é o marcador de "última análise" do trigger stale-while-serving).
 * Retorna null em pré-condição não satisfeita (sem script ativo / sem calls).
 */
async function executeScriptGapRun(params: {
  orgId: string
  trigger: 'auto' | 'manual'
  createdBy?: string | null
}): Promise<ScriptGapAnalysis | null> {
  const result = await runScriptGapDetection(params.orgId)
  if (!result.ok) {
    // Sem script ativo / sem calls é pré-condição, não erro fatal — não grava
    // run (não há nada a analisar) e deixa o dashboard mostrar empty state.
    if (result.error.startsWith('No ') || result.error.includes('no sections')) {
      return null
    }
    throw new Error(result.error)
  }

  const rows = await dbReplacePendingScriptGaps(params.orgId, result.gaps)

  const run = await dbInsertScriptGapRun({
    orgId: params.orgId,
    callIds: result.callIds,
    gapCount: rows.length,
    modelUsed: result.modelUsed,
    createdBy: params.createdBy ?? null,
    trigger: params.trigger,
  })

  return {
    analyzedAt: run.ran_at,
    callsAnalyzed: result.callIds,
    gaps: rows.map(toScriptGap),
  }
}

/**
 * Análise de Script Gap da org ativa para o dashboard (server component).
 * Stale-while-serving: se a última run é >7d (ou não existe), dispara uma nova
 * análise automática e devolve o resultado fresco; senão serve o cache.
 *
 * NUNCA propaga erro — o dashboard inteiro renderiza junto, então uma falha de
 * IA/rede cai graciosamente para o cache existente (ou null/empty state).
 */
export async function getScriptGaps(): Promise<ScriptGapAnalysis | null> {
  const ctx = await getActiveOrgContext()
  if (!ctx?.activeOrgId) return null
  const orgId = ctx.activeOrgId

  let latestRunAt: string | null = null
  try {
    const latest = await dbGetLatestScriptGapRun(orgId)
    latestRunAt = latest?.ran_at ?? null

    if (!latest || isStale(latest.ran_at)) {
      const fresh = await executeScriptGapRun({
        orgId,
        trigger: 'auto',
        createdBy: ctx.userId ?? null,
      })
      if (fresh) return fresh
      // Pré-condição não satisfeita — cai pro cache existente (se houver).
    }
  } catch (err) {
    // Falha de IA/rede/DB no auto-run não pode derrubar o dashboard.
    console.error(
      '[script-gaps] auto-run falhou, servindo cache:',
      err instanceof Error ? err.message : err,
    )
  }

  return buildAnalysisFromDb(orgId, latestRunAt)
}
