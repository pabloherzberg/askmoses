import { createClient } from '@supabase/supabase-js'

// Marca calls com seções todas zeradas OU intent breakdown 0/0/0/0 com
// scoring_status = 'scoring_failed' (checklist §3.1.2). Zero aqui não é
// avaliação real, é falha de scoring — não mexe nos valores, só sinaliza
// pros consumidores de média excluírem (§0.3).

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DRY_RUN = process.argv.includes('--dry-run')
const APPLIED_BY = '113_mark_scoring_failed'
const REASON = 'Seções todas zeradas e/ou intent breakdown 0/0/0/0 — falha de scoring, não avaliação real (checklist §3.1.2)'

const { data: withSections } = await supabase
  .from('calls')
  .select('id, sections, scoring_status')
  .not('sections', 'is', null)

const zeroedSections = (withSections ?? []).filter((c) => {
  const sections = c.sections as Array<{ score?: number }> | null
  return sections && sections.length > 0 && sections.every((s) => !(Number(s.score) > 0))
})

const { data: withBreakdown } = await supabase
  .from('calls')
  .select('id, intent_breakdown, scoring_status')
  .not('intent_breakdown', 'is', null)

const zeroedIntent = (withBreakdown ?? []).filter((c) => {
  const b = c.intent_breakdown as Record<string, number> | null
  return b && Number(b.financial) === 0 && Number(b.urgency) === 0 && Number(b.authority) === 0 && Number(b.engagement) === 0
})

const byId = new Map<string, { scoring_status: string | null }>()
for (const c of zeroedSections) byId.set(c.id, { scoring_status: c.scoring_status as string | null })
for (const c of zeroedIntent) if (!byId.has(c.id)) byId.set(c.id, { scoring_status: c.scoring_status as string | null })

console.log(`${byId.size} calls encontradas (união seções zeradas + intent zerado).${DRY_RUN ? ' [DRY RUN]' : ''}\n`)

let marked = 0
let skippedAlreadyMarked = 0
let failed = 0

for (const [id, info] of byId) {
  if (info.scoring_status) {
    console.log(`  [skip] ${id}: já tem scoring_status = '${info.scoring_status}'`)
    skippedAlreadyMarked++
    continue
  }

  console.log(`  ${id}: scoring_status NULL -> scoring_failed`)
  if (DRY_RUN) continue

  const { error: corrErr } = await supabase.from('calls_data_corrections').insert({
    call_id: id,
    column_name: 'scoring_status',
    old_value: null,
    new_value: 'scoring_failed',
    applied_by: APPLIED_BY,
    reason: REASON,
  })
  if (corrErr) console.error(`    AVISO: falha ao gravar auditoria: ${corrErr.message}`)

  const { error: updErr } = await supabase
    .from('calls')
    .update({ scoring_status: 'scoring_failed' })
    .eq('id', id)
  if (updErr) { console.error(`    FALHOU: ${updErr.message}`); failed++ } else { marked++ }
}

console.log(`\nResumo: marcadas=${marked} já_marcadas=${skippedAlreadyMarked} falhas=${failed}`)
