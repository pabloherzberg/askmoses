import { createClient } from '@supabase/supabase-js'
import { computeOverallScore } from '@/lib/services/overall-score'

// Recalcula o overall_score histórico usando a mesma fórmula agora aplicada
// a calls novas (checklist §5.1.3) — média ponderada pelos pesos já
// gravados em cada seção (calls.sections[].weight), com fallback pra média
// simples quando falta peso em alguma seção. Não chama IA: os scores por
// seção já existem, só a AGREGAÇÃO muda.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DRY_RUN = process.argv.includes('--dry-run')
const APPLIED_BY = '116_recalc_overall_score_history'
const REASON = 'Recálculo do histórico com pesos reais — pesos eram gravados mas nunca usados no cálculo (checklist §5.1)'

async function recordCorrection(callId: string, oldValue: number | null, newValue: number) {
  const { error } = await supabase.from('calls_data_corrections').insert({
    call_id: callId,
    column_name: 'overall_score',
    old_value: oldValue,
    new_value: newValue,
    applied_by: APPLIED_BY,
    reason: REASON,
  })
  if (error) console.error(`    AVISO: falha ao gravar auditoria: ${error.message}`)
}

const { data: calls, error } = await supabase
  .from('calls')
  .select('id, sections, overall_score')
  .not('sections', 'is', null)

if (error) {
  console.error('query error:', error.message)
  process.exit(1)
}

console.log(`${calls?.length ?? 0} calls com sections encontradas.${DRY_RUN ? ' [DRY RUN]' : ''}\n`)

let changed = 0
let unchanged = 0
let skippedEmpty = 0
let failed = 0

for (const c of calls ?? []) {
  const sections = c.sections as Array<{ name: string; score: number; weight?: number | null }> | null
  if (!sections || sections.length === 0) {
    skippedEmpty++
    continue
  }

  const weightByName = new Map<string, number>()
  for (const s of sections) {
    if (typeof s.weight === 'number') weightByName.set(s.name.toLowerCase(), s.weight)
  }

  const newScore = computeOverallScore(sections, weightByName)

  if (newScore === c.overall_score) {
    unchanged++
    continue
  }

  console.log(`  ${c.id}: overall_score ${c.overall_score} -> ${newScore}`)
  changed++

  if (DRY_RUN) continue

  await recordCorrection(c.id, c.overall_score, newScore)
  const { error: updErr } = await supabase
    .from('calls')
    .update({ overall_score: newScore, updated_at: new Date().toISOString() })
    .eq('id', c.id)
  if (updErr) { console.error(`    FALHOU: ${updErr.message}`); failed++ }
}

console.log(`\nResumo:`)
console.log(`  Mudaram: ${changed}`)
console.log(`  Sem mudança: ${unchanged}`)
console.log(`  Sem sections: ${skippedEmpty}`)
if (failed > 0) console.log(`  FALHAS: ${failed}`)
console.log('\nConcluído.')
