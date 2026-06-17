import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const CALL_ID = '305458ae-0ee9-4db8-b126-a84c87907bbb'

// Query mais ampla sem filtros extras
const { data, error } = await supabase
  .from('calls')
  .select('*')
  .eq('id', CALL_ID)
  .single()

if (error) { console.error('query error:', error.message, error.code); process.exit(1) }

console.log('=== CALL COMPLETA ===')
console.log('processing_status:', data?.processing_status)
console.log('overall_score:', data?.overall_score)
console.log('intent:', data?.intent)
console.log('call_outcome:', data?.call_outcome)
console.log('transcript length:', (data?.transcript as string | null)?.length ?? 0)
console.log('transcript preview:', (data?.transcript as string | null)?.slice(0, 200) ?? '(vazio)')
console.log('summary:', data?.summary ? (data.summary as string).slice(0, 100) : '(null)')
console.log('sections count:', Array.isArray(data?.sections) ? (data.sections as unknown[]).length : '(null/not array)')
console.log('email_sent:', data?.email_sent)

const { data: chunks } = await supabase
  .from('call_chunks')
  .select('chunk_index, status, attempts, last_error, transcript')
  .eq('call_id', CALL_ID)
  .order('chunk_index')

console.log('\n=== CHUNKS ===')
for (const c of chunks ?? []) {
  const tlen = (c.transcript as string | null)?.length ?? 0
  console.log(`chunk ${c.chunk_index}: ${c.status} | attempts: ${c.attempts} | transcript: ${tlen} chars | error: ${c.last_error ?? '-'}`)
}
