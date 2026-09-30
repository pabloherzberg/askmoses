import { createClient } from '@supabase/supabase-js'
import { computeOverallScore } from '@/lib/services/overall-score'
import {
  applyOverallScoreCorrection,
  fetchCallsWithSections,
  type CallWithSections,
} from '@/lib/data-corrections/recalc-overall-score'

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
const APPLIED_BY = '116_recalc_overall_score_history:victor'
const REASON = 'Recálculo do histórico com pesos reais — pesos eram gravados mas nunca usados no cálculo (checklist §5.1)'

let calls: CallWithSections[]
try {
  calls = await fetchCallsWithSections(supabase)
} catch (err) {
  console.error('query error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
}

console.log(`${calls.length} calls com sections encontradas.${DRY_RUN ? ' [DRY RUN]' : ''}\n`)

let changed = 0
let unchanged = 0
let skippedEmpty = 0
let failed = 0
let auditFailed = 0

for (const c of calls) {
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

  const { result, message } = await applyOverallScoreCorrection(supabase, c, newScore, {
    appliedBy: APPLIED_BY,
    reason: REASON,
  })
  if (result === 'audit_failed') {
    console.error(`    FALHOU (trilha, call NÃO alterada): ${message}`)
    auditFailed++
    failed++
  } else if (result === 'update_failed') {
    console.error(`    FALHOU (update; trilha já gravada): ${message}`)
    failed++
  }
}

console.log(`\nResumo:`)
console.log(`  Mudaram: ${changed}`)
console.log(`  Sem mudança: ${unchanged}`)
console.log(`  Sem sections: ${skippedEmpty}`)
if (failed > 0) console.log(`  FALHAS: ${failed} (${auditFailed} na trilha, sem UPDATE)`)
console.log('\nConcluído.')
