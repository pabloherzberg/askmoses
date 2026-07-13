import { createClient } from '@supabase/supabase-js'
import { scoreIntentFromTranscript } from '@/lib/services/intent-scoring'
import { computeIntentIndex } from '@/lib/utils/intentScore'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ORG_ID = '05a9d17d-345f-4d9e-9dde-dcdcc0eeee1b' // Unleashed Consulting 1A
const DRY_RUN = process.argv.includes('--dry-run')
const DEFAULT_WEIGHTS = { financial: 25, urgency: 25, authority: 25, engagement: 25 }

const { data: org, error: orgError } = await supabase
  .from('organizations')
  .select('id, name')
  .eq('id', ORG_ID)
  .single()

if (orgError || !org) {
  console.error('org lookup failed:', orgError?.message)
  process.exit(1)
}
console.log(`Org confirmada: ${org.name} (${org.id})`)

const { data: calls, error } = await supabase
  .from('calls')
  .select('id, trainer_name, client_name, transcript, call_outcome, intent, intent_breakdown, intent_weights')
  .eq('org_id', ORG_ID)
  .eq('call_outcome', 'closed')

if (error) {
  console.error('query error:', error.message)
  process.exit(1)
}

console.log(`\n${calls?.length ?? 0} calls 'closed' encontradas.\n`)

for (const c of calls ?? []) {
  const breakdown = c.intent_breakdown as Record<string, number> | null
  const isZeroed =
    breakdown &&
    breakdown.financial === 0 &&
    breakdown.urgency === 0 &&
    breakdown.authority === 0 &&
    breakdown.engagement === 0

  if (!c.transcript) {
    console.log(`  SKIP ${c.id}: sem transcript, não é possível reanalisar.`)
    continue
  }

  if (!isZeroed && breakdown) {
    console.log(`  SKIP ${c.id}: já tem breakdown não-zerado (${JSON.stringify(breakdown)}), não reanalisando.`)
    continue
  }

  console.log(`  Analisando ${c.id} (${c.trainer_name} / ${c.client_name})...`)
  const weights = (c.intent_weights as Record<string, number> | null) ?? DEFAULT_WEIGHTS

  const result = await scoreIntentFromTranscript({
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

  const newIntent = Math.max(0, Math.min(5, computeIntentIndex(result.breakdown, weights)))

  console.log(`    breakdown: ${JSON.stringify(result.breakdown)}`)
  console.log(`    intent: ${c.intent} -> ${newIntent}`)

  if (DRY_RUN) {
    console.log('    --dry-run: não gravado.')
    continue
  }

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
  } else {
    console.log('    OK, gravado.')
  }
}

console.log('\nConcluído.')
