import { createClient } from '@supabase/supabase-js'

// Marca calls com prompt vazado no transcript (checklist §3.2.4) com
// scoring_status = 'transcript_leaked'. NÃO toca no transcript em si —
// só sinaliza pros consumidores de média excluírem (§0.3).
//
// Escopo: só as calls SEM nota (overall_score IS NULL) — essas não têm
// como ser recuperadas por repontuação, e não têm áudio sendo reprocessado
// manualmente (diferente do lote de 12 calls pontuadas com recording_url,
// que o usuário está reprocessando via UI). Ver checklist §3.2.5.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DRY_RUN = process.argv.includes('--dry-run')
const APPLIED_BY = '112_mark_transcript_leaked'
const REASON = 'Prompt vazado no transcript, sem nota e sem reprocessamento em curso (checklist §3.2.4)'

const { data: calls, error } = await supabase
  .from('calls')
  .select('id, overall_score')
  .is('overall_score', null)
  .or('transcript.ilike.%TRANSCRIPT_BEGIN%,transcript.ilike.%Output rules%,transcript.ilike.%This is a sales call between a salesperson and a prospect%')

if (error) { console.error(error.message); process.exit(1) }

console.log(`${calls?.length ?? 0} calls encontradas.${DRY_RUN ? ' [DRY RUN]' : ''}\n`)

let marked = 0
let failed = 0

for (const c of calls ?? []) {
  console.log(`  ${c.id}: scoring_status NULL -> transcript_leaked`)
  if (DRY_RUN) continue

  const { error: corrErr } = await supabase.from('calls_data_corrections').insert({
    call_id: c.id,
    column_name: 'scoring_status',
    old_value: null,
    new_value: 'transcript_leaked',
    applied_by: APPLIED_BY,
    reason: REASON,
  })
  if (corrErr) console.error(`    AVISO: falha ao gravar auditoria: ${corrErr.message}`)

  const { error: updErr } = await supabase
    .from('calls')
    .update({ scoring_status: 'transcript_leaked' })
    .eq('id', c.id)
  if (updErr) { console.error(`    FALHOU: ${updErr.message}`); failed++ } else { marked++ }
}

console.log(`\nResumo: marcadas=${marked} falhas=${failed}`)
