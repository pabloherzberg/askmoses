import { createClient } from '@supabase/supabase-js'
import { scoreIntentFromTranscript } from '@/lib/services/intent-scoring'
import { computeIntentIndex } from '@/lib/utils/intentScore'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DRY_RUN = process.argv.includes('--dry-run')
const ORG_ID = process.argv.find((a) => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1])
const DEFAULT_WEIGHTS = { financial: 25, urgency: 25, authority: 25, engagement: 25 }

if (!ORG_ID) {
  console.error('Uso: npx tsx --env-file=.env scripts/recalc-org-intent.mts <ORG_ID> [--dry-run]')
  process.exit(1)
}

const { data: org, error: orgError } = await supabase
  .from('organizations')
  .select('id, name')
  .eq('id', ORG_ID)
  .single()

if (orgError || !org) {
  console.error('org lookup failed:', orgError?.message)
  process.exit(1)
}
console.log(`Org confirmada: ${org.name} (${org.id})${DRY_RUN ? ' [DRY RUN]' : ''}`)

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

let recalculatedFromBreakdown = 0
let reanalyzedViaAI = 0
let skippedNoTranscript = 0
let failed = 0

for (const c of calls ?? []) {
  const breakdown = c.intent_breakdown as Record<string, number> | null
  const weights = (c.intent_weights as Record<string, number> | null) ?? DEFAULT_WEIGHTS

  // Caso 1: já existe breakdown real (não-zerado, não-nulo) — só reaplica a
  // fórmula, sem chamar a IA de novo. Cobre calls onde a IA já tinha rodado
  // mas o intent final foi sobrescrito pra 5 pela regra fixa antiga.
  const isZeroed =
    breakdown &&
    breakdown.financial === 0 &&
    breakdown.urgency === 0 &&
    breakdown.authority === 0 &&
    breakdown.engagement === 0

  if (breakdown && !isZeroed) {
    const newIntent = Math.max(0, Math.min(5, computeIntentIndex(breakdown, weights)))
    if (newIntent === c.intent) continue // já está correto
    console.log(`  [fórmula] ${c.id}: intent ${c.intent} -> ${newIntent} (breakdown já existente: ${JSON.stringify(breakdown)})`)
    recalculatedFromBreakdown++
    if (!DRY_RUN) {
      const { error: updErr } = await supabase
        .from('calls')
        .update({ intent: newIntent, updated_at: new Date().toISOString() })
        .eq('id', c.id)
      if (updErr) { console.error(`    FALHOU: ${updErr.message}`); failed++ }
    }
    continue
  }

  // Caso 2: sem breakdown (null) ou zerado — precisa rodar a IA sobre o
  // transcript real pra gerar um breakdown de verdade.
  if (!c.transcript || c.transcript.trim().length === 0) {
    console.log(`  [skip] ${c.id}: sem transcript, não é possível reanalisar.`)
    skippedNoTranscript++
    continue
  }

  console.log(`  [IA] Analisando ${c.id} (${c.trainer_name} / ${c.client_name})...`)
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
  reanalyzedViaAI++

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
    failed++
  } else {
    console.log('    OK, gravado.')
  }
}

console.log(`\nResumo:`)
console.log(`  Recalculadas via fórmula (breakdown já existia): ${recalculatedFromBreakdown}`)
console.log(`  Reanalisadas via IA (breakdown ausente/zerado): ${reanalyzedViaAI}`)
console.log(`  Puladas (sem transcript): ${skippedNoTranscript}`)
if (failed > 0) console.log(`  FALHAS: ${failed}`)
console.log('\nConcluído.')
