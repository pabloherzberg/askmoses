import type { SupabaseClient } from '@supabase/supabase-js'

// Peças do scripts/recalc-overall-score-history.mts que valem teste: a
// leitura paginada e a regra "sem trilha, sem UPDATE". Ficam aqui porque o
// script roda no topo do arquivo e cria o client na importação.

// O PostgREST corta cada resposta em 1000 linhas (max-rows) sem erro nenhum —
// um select único devolvia 1000 de ~1075 e o resto nunca era recalculado.
export const CALLS_PAGE_SIZE = 500

export interface CallWithSections {
  id: string
  sections: unknown
  overall_score: number | null
}

export async function fetchCallsWithSections(
  supabase: SupabaseClient,
  pageSize: number = CALLS_PAGE_SIZE,
): Promise<CallWithSections[]> {
  const all: CallWithSections[] = []
  for (let from = 0; ; from += pageSize) {
    // order('id') é obrigatório: sem ordem estável, offset/limit pode repetir
    // ou pular linhas entre uma página e outra.
    const { data, error } = await supabase
      .from('calls')
      .select('id, sections, overall_score')
      .not('sections', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`fetchCallsWithSections (offset ${from}): ${error.message}`)
    const rows = (data ?? []) as CallWithSections[]
    all.push(...rows)
    if (rows.length < pageSize) break
  }
  return all
}

export type CorrectionResult = 'updated' | 'audit_failed' | 'update_failed'

// Grava a trilha ANTES do UPDATE. Se a trilha falhar, a call não é tocada —
// uma correção sem registro não pode ser auditada nem revertida.
export async function applyOverallScoreCorrection(
  supabase: SupabaseClient,
  call: { id: string; overall_score: number | null },
  newScore: number,
  audit: { appliedBy: string; reason: string },
): Promise<{ result: CorrectionResult; message?: string }> {
  const { error: auditErr } = await supabase.from('calls_data_corrections').insert({
    call_id: call.id,
    column_name: 'overall_score',
    old_value: call.overall_score,
    new_value: newScore,
    applied_by: audit.appliedBy,
    reason: audit.reason,
  })
  if (auditErr) return { result: 'audit_failed', message: auditErr.message }

  const { error: updErr } = await supabase
    .from('calls')
    .update({ overall_score: newScore, updated_at: new Date().toISOString() })
    .eq('id', call.id)
  if (updErr) return { result: 'update_failed', message: updErr.message }

  return { result: 'updated' }
}
