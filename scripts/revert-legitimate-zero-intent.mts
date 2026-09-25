import { createClient } from '@supabase/supabase-js'

// Reverte scoring_status para NULL nas calls marcadas 'scoring_failed' cujo
// intent_breakdown 0/0/0/0 é LEGÍTIMO, não falha de scoring — confirmado via
// reprocessamento (reprocess-zeroed-intent.mts): são voicemails/ligações não
// atendidas, sem prospect real na linha. A IA reanalisou e voltou 0/0/0/0 de
// novo, com feedback explícito explicando ("no discovery, it's a voicemail").
// Checklist §3.1 (achado durante execução, não previsto originalmente).

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DRY_RUN = process.argv.includes('--dry-run')
const APPLIED_BY = '115_revert_legitimate_zero_intent'
const REASON = 'intent 0/0/0/0 confirmado legítimo via reprocessamento — voicemail/não atendida, não falha de scoring'

const { data: calls, error } = await supabase
  .from('calls')
  .select('id, intent_breakdown, scoring_status')
  .eq('scoring_status', 'scoring_failed')

if (error) { console.error(error.message); process.exit(1) }

const zeroed = (calls ?? []).filter((c) => {
  const b = c.intent_breakdown as Record<string, number> | null
  return b && Number(b.financial) === 0 && Number(b.urgency) === 0 && Number(b.authority) === 0 && Number(b.engagement) === 0
})

console.log(`${zeroed.length} calls a reverter.${DRY_RUN ? ' [DRY RUN]' : ''}\n`)

let reverted = 0
let failed = 0

for (const c of zeroed) {
  console.log(`  ${c.id}: scoring_status scoring_failed -> NULL`)
  if (DRY_RUN) continue

  const { error: corrErr } = await supabase.from('calls_data_corrections').insert({
    call_id: c.id,
    column_name: 'scoring_status',
    old_value: 'scoring_failed',
    new_value: null,
    applied_by: APPLIED_BY,
    reason: REASON,
  })
  if (corrErr) console.error(`    AVISO: falha ao gravar auditoria: ${corrErr.message}`)

  const { error: updErr } = await supabase
    .from('calls')
    .update({ scoring_status: null })
    .eq('id', c.id)
  if (updErr) { console.error(`    FALHOU: ${updErr.message}`); failed++ } else { reverted++ }
}

console.log(`\nResumo: revertidas=${reverted} falhas=${failed}`)
