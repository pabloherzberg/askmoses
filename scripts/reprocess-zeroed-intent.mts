import { createClient } from '@supabase/supabase-js'
import { scoreIntentFromTranscript } from '@/lib/services/intent-scoring'
import { computeIntentIndex } from '@/lib/utils/intentScore'

// Reprocessa via IA as calls marcadas scoring_status = 'scoring_failed' cujo
// intent_breakdown está 0/0/0/0 (checklist §3.1.4). Variante de
// recalc-org-intent.mts sem o filtro `call_outcome = 'closed'` — aqui
// qualquer outcome com intent zerado entra, porque a causa é falha de
// scoring, não a regra "closed ⇒ intent 5" do §1.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DRY_RUN = process.argv.includes('--dry-run')
const DEFAULT_WEIGHTS = { financial: 25, urgency: 25, authority: 25, engagement: 25 }
const APPLIED_BY = '114_reprocess_zeroed_intent'
const REASON = "Reprocessamento de intent zerado em calls scoring_failed (checklist §3.1.4)"

async function recordCorrection(callId: string, oldValue: unknown, newValue: unknown) {
  const { error } = await supabase.from('calls_data_corrections').insert({
    call_id: callId,
    column_name: 'intent',
    old_value: oldValue,
    new_value: newValue,
    applied_by: APPLIED_BY,
    reason: REASON,
  })
  if (error) console.error(`    AVISO: falha ao gravar auditoria: ${error.message}`)
}

const { data: calls, error } = await supabase
  .from('calls')
  .select('id, org_id, trainer_name, client_name, transcript, intent, intent_breakdown, intent_weights, scoring_status')
  .eq('scoring_status', 'scoring_failed')

if (error) {
  console.error('query error:', error.message)
  process.exit(1)
}

const zeroed = (calls ?? []).filter((c) => {
  const b = c.intent_breakdown as Record<string, number> | null
  return b && Number(b.financial) === 0 && Number(b.urgency) === 0 && Number(b.authority) === 0 && Number(b.engagement) === 0
})

console.log(`${zeroed.length} calls com intent zerado (de ${calls?.length ?? 0} scoring_failed).${DRY_RUN ? ' [DRY RUN]' : ''}\n`)

let reanalyzed = 0
let skippedNoTranscript = 0
let failed = 0

for (const c of zeroed) {
  if (!c.transcript || c.transcript.trim().length === 0) {
    console.log(`  [skip] ${c.id}: sem transcript.`)
    skippedNoTranscript++
    continue
  }

  const weights = (c.intent_weights as Record<string, number> | null) ?? DEFAULT_WEIGHTS

  console.log(`  [IA] ${c.id} (${c.trainer_name} / ${c.client_name})...`)
  await new Promise((r) => setTimeout(r, 3000)) // respeita rate limit TPM da OpenAI

  let result: Awaited<ReturnType<typeof scoreIntentFromTranscript>> | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      result = await scoreIntentFromTranscript({
        transcript: c.transcript as string,
        trainerName: c.trainer_name ?? undefined,
        clientName: c.client_name ?? undefined,
        weights: {
          financial: weights.financial,
          urgency: weights.urgency,
          authority: weights.authority,
          engagement: weights.engagement,
        },
      })
      break
    } catch (err) {
      console.error(`    tentativa ${attempt}/3 falhou: ${err instanceof Error ? err.message : String(err)}`)
      if (attempt < 3) await new Promise((r) => setTimeout(r, 10000))
    }
  }
  if (!result) {
    console.error(`    FALHOU após 3 tentativas, pulando ${c.id}.`)
    failed++
    continue
  }

  const newIntent = Math.max(0, Math.min(5, computeIntentIndex(result.breakdown, weights)))
  console.log(`    breakdown: ${JSON.stringify(result.breakdown)}`)
  console.log(`    intent: ${c.intent} -> ${newIntent}`)
  reanalyzed++

  if (DRY_RUN) {
    console.log('    --dry-run: não gravado.')
    continue
  }

  await recordCorrection(c.id, c.intent, newIntent)
  const { error: updErr } = await supabase
    .from('calls')
    .update({
      intent: newIntent,
      intent_breakdown: result.breakdown,
      updated_at: new Date().toISOString(),
    })
    .eq('id', c.id)

  if (updErr) {
    console.error(`    FALHOU: ${updErr.message}`)
    failed++
  } else {
    console.log('    OK, gravado.')
  }
}

console.log(`\nResumo:`)
console.log(`  Reanalisadas via IA: ${reanalyzed}`)
console.log(`  Puladas (sem transcript): ${skippedNoTranscript}`)
if (failed > 0) console.log(`  FALHAS: ${failed}`)
console.log('\nConcluído.')
