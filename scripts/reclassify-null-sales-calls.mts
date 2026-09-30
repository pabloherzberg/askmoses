import { createClient } from '@supabase/supabase-js'
import { classifySalesCall } from '@/lib/services/sales-call-classifier'

// Reprocessa via IA as calls com is_sales_call = NULL (checklist §2.2).
// Não é backfill SQL: cada call precisa da IA lendo o transcript real,
// porque NULL aqui significa "nunca classificado" (legado pré-migration 104),
// não "classificado como venda". Regra de leitura em lib/sales-calls.ts NÃO
// muda com este script — continua tratando NULL como sales call.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DRY_RUN = process.argv.includes('--dry-run')
const APPLIED_BY = '111_reclassify_null_sales_calls'
const REASON = 'Reprocessamento via IA de is_sales_call NULL (checklist §2.2)'

async function recordCorrection(callId: string, oldValue: null, newValue: boolean) {
  const { error } = await supabase.from('calls_data_corrections').insert({
    call_id: callId,
    column_name: 'is_sales_call',
    old_value: oldValue,
    new_value: newValue,
    applied_by: APPLIED_BY,
    reason: REASON,
  })
  if (error) console.error(`    AVISO: falha ao gravar auditoria: ${error.message}`)
}

const { data: calls, error } = await supabase
  .from('calls')
  .select('id, org_id, transcript')
  .is('is_sales_call', null)

if (error) {
  console.error('query error:', error.message)
  process.exit(1)
}

console.log(`${calls?.length ?? 0} calls com is_sales_call = NULL encontradas.${DRY_RUN ? ' [DRY RUN]' : ''}\n`)

let classifiedTrue = 0
let classifiedFalse = 0
let skippedNoTranscript = 0
let failed = 0

for (const c of calls ?? []) {
  if (!c.transcript || c.transcript.trim().length === 0) {
    console.log(`  [skip] ${c.id}: sem transcript, não é possível classificar.`)
    skippedNoTranscript++
    continue
  }

  let result: Awaited<ReturnType<typeof classifySalesCall>> | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      result = await classifySalesCall(c.transcript as string)
      break
    } catch (err) {
      console.error(`  [${c.id}] tentativa ${attempt}/3 falhou: ${err instanceof Error ? err.message : String(err)}`)
      if (attempt < 3) await new Promise((r) => setTimeout(r, 10000))
    }
  }
  if (!result) {
    console.error(`  [${c.id}] FALHOU após 3 tentativas, pulando.`)
    failed++
    continue
  }

  console.log(`  ${c.id}: is_sales_call NULL -> ${result.isSalesCall} (${result.reasoning})`)
  if (result.isSalesCall) classifiedTrue++
  else classifiedFalse++

  if (DRY_RUN) {
    await new Promise((r) => setTimeout(r, 1000))
    continue
  }

  await recordCorrection(c.id, null, result.isSalesCall)
  const { error: updErr } = await supabase
    .from('calls')
    .update({ is_sales_call: result.isSalesCall })
    .eq('id', c.id)
  if (updErr) { console.error(`    FALHOU ao gravar: ${updErr.message}`); failed++ }

  await new Promise((r) => setTimeout(r, 1000)) // respeita rate limit TPM
}

console.log(`\nResumo:`)
console.log(`  Classificadas como venda (true): ${classifiedTrue}`)
console.log(`  Classificadas como NÃO venda (false): ${classifiedFalse}`)
console.log(`  Puladas (sem transcript): ${skippedNoTranscript}`)
if (failed > 0) console.log(`  FALHAS: ${failed}`)
console.log('\nConcluído.')
