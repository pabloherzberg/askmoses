import { createAdminClient } from '@/lib/supabase/admin'

export interface DbCall {
  id: string
  rubric_id: string | null
  trainer_id: string | null
  trainer_name: string
  trainer_email: string | null
  transcript: string | null
  overall_score: number | null
  summary: string | null
  strengths: string[] | null
  improvements: string[] | null
  email_sent: boolean
  email_id: string | null
  created_at: string
  updated_at: string
  call_outcome: string | null
  client_name: string | null
  detected_outcome: string | null
  model_used: string | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
  prompt_version: string | null
  sections: unknown
  // ML fields — added in migration 036
  closed: boolean | null
  call_date: string | null
  duration_seconds: number | null
  // GHL/Pepper CRM lead enrichment — added in migration 043
  lead_name: string | null
  lead_source: string | null
}

export interface CreateCallInput {
  orgId?: string
  rubricId?: string
  trainerId?: string
  trainerName: string
  trainerEmail?: string
  transcript?: string
  overallScore?: number
  summary?: string
  strengths?: string[]
  improvements?: string[]
  callOutcome?: string
  clientName?: string
  detectedOutcome?: string
  modelUsed?: string
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  promptVersion?: string
  sections?: Record<string, unknown> | unknown[]
  leadName?: string | null
  leadSource?: string | null
}

export interface UpdateCallInput {
  rubricId?: string
  trainerName?: string
  trainerEmail?: string
  transcript?: string
  overallScore?: number
  summary?: string
  strengths?: string[]
  improvements?: string[]
  emailSent?: boolean
  emailId?: string
  callOutcome?: string
  clientName?: string
  detectedOutcome?: string
}

export interface GetCallsFilters {
  orgId?: string
  trainerId?: string
  trainerName?: string
  callOutcome?: string
  rubricId?: string
  limit?: number
  offset?: number
}

export async function dbGetCalls(filters?: GetCallsFilters): Promise<DbCall[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('calls')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters?.orgId) query = query.eq('org_id', filters.orgId)
  if (filters?.trainerId) query = query.eq('trainer_id', filters.trainerId)
  else if (filters?.trainerName) query = query.eq('trainer_name', filters.trainerName)
  if (filters?.callOutcome) query = query.eq('call_outcome', filters.callOutcome)
  if (filters?.rubricId) query = query.eq('rubric_id', filters.rubricId)
  if (filters?.limit) query = query.limit(filters.limit)
  if (filters?.offset && filters?.limit) {
    query = query.range(filters.offset, filters.offset + filters.limit - 1)
  }

  const { data, error } = await query

  if (error) throw new Error(`dbGetCalls: ${error.message}`)

  return (data ?? []) as DbCall[]
}

export interface GetCallByIdScope {
  orgId?: string
  trainerId?: string
}

export async function dbGetCallById(id: string, scope?: GetCallByIdScope): Promise<DbCall | null> {
  const supabase = createAdminClient()

  let query = supabase
    .from('calls')
    .select('*')
    .eq('id', id)

  if (scope?.orgId) query = query.eq('org_id', scope.orgId)
  if (scope?.trainerId) query = query.eq('trainer_id', scope.trainerId)

  const { data, error } = await query.maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetCallById: ${error.message}`)
  }

  return (data ?? null) as DbCall | null
}

export async function dbCreateCall(input: CreateCallInput): Promise<DbCall> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('calls')
    .insert({
      org_id: input.orgId ?? null,
      rubric_id: input.rubricId ?? null,
      trainer_id: input.trainerId ?? null,
      trainer_name: input.trainerName,
      trainer_email: input.trainerEmail ?? '',
      transcript: input.transcript ?? null,
      overall_score: input.overallScore ?? null,
      summary: input.summary ?? null,
      strengths: input.strengths ?? null,
      improvements: input.improvements ?? null,
      call_outcome: input.callOutcome ?? null,
      client_name: input.clientName ?? null,
      detected_outcome: input.detectedOutcome ?? null,
      model_used: input.modelUsed ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      cost_usd: input.costUsd ?? null,
      prompt_version: input.promptVersion ?? null,
      sections: input.sections ?? null,
      email_sent: false,
      lead_name: input.leadName ?? null,
      lead_source: input.leadSource ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`dbCreateCall: ${error.message}`)

  return data as DbCall
}

/**
 * Scope filter applied to mutating queries. Both `dbUpdateCall` and
 * `dbDeleteCall` use the admin client (RLS-bypassing) so we apply
 * `org_id` / `trainer_id` here as defense in depth — a missing scope at
 * the route level still won't update/delete cross-tenant rows.
 */
export interface CallMutationScope {
  orgId?: string
  trainerId?: string
}

export async function dbUpdateCall(
  id: string,
  input: UpdateCallInput,
  scope?: CallMutationScope,
): Promise<DbCall | null> {
  const supabase = createAdminClient()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.rubricId !== undefined) patch.rubric_id = input.rubricId
  if (input.trainerName !== undefined) patch.trainer_name = input.trainerName
  if (input.trainerEmail !== undefined) patch.trainer_email = input.trainerEmail
  if (input.transcript !== undefined) patch.transcript = input.transcript
  if (input.overallScore !== undefined) patch.overall_score = input.overallScore
  if (input.summary !== undefined) patch.summary = input.summary
  if (input.strengths !== undefined) patch.strengths = input.strengths
  if (input.improvements !== undefined) patch.improvements = input.improvements
  if (input.emailSent !== undefined) patch.email_sent = input.emailSent
  if (input.emailId !== undefined) patch.email_id = input.emailId
  if (input.callOutcome !== undefined) patch.call_outcome = input.callOutcome
  if (input.clientName !== undefined) patch.client_name = input.clientName
  if (input.detectedOutcome !== undefined) patch.detected_outcome = input.detectedOutcome

  let query = supabase.from('calls').update(patch).eq('id', id)
  if (scope?.orgId) query = query.eq('org_id', scope.orgId)
  if (scope?.trainerId) query = query.eq('trainer_id', scope.trainerId)

  const { data, error } = await query.select().maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbUpdateCall: ${error.message}`)
  }

  return (data ?? null) as DbCall | null
}

export async function dbDeleteCall(id: string, scope?: CallMutationScope): Promise<boolean> {
  const supabase = createAdminClient()

  let query = supabase.from('calls').delete({ count: 'exact' }).eq('id', id)
  if (scope?.orgId) query = query.eq('org_id', scope.orgId)
  if (scope?.trainerId) query = query.eq('trainer_id', scope.trainerId)

  const { error, count } = await query

  if (error) throw new Error(`dbDeleteCall: ${error.message}`)
  return (count ?? 0) > 0
}

// ────────────────────────────────────────────────────────────────────────────
// GHL ingestion helpers
// Mantidos separados de dbCreateCall para não inflar a função canônica com
// opcionais que só fazem sentido na rota do webhook.
// ────────────────────────────────────────────────────────────────────────────

export type ProcessingStatus =
  | 'pending'
  | 'processing'
  | 'transcribed'
  | 'no_recording'
  | 'transcription_failed'
  | 'webhook_failed'

export interface CreateGhlCallInput {
  orgId: string
  externalCallId: string
  ghlPayload: Record<string, unknown>
  trainerName: string
  trainerEmail?: string | null
  clientName?: string | null
  leadName?: string | null
  leadSource?: string | null
  callOutcome?: string | null
  durationSeconds?: number | null
}

export interface UpsertResult {
  call: DbCall
  isNew: boolean
}

/**
 * Insere uma call ingerida pelo webhook GHL marcada como pending.
 * Idempotente: se já existe linha com o mesmo external_call_id, retorna
 * essa linha e isNew=false (o pipeline NÃO deve reprocessar).
 */
export async function dbUpsertGhlCall(input: CreateGhlCallInput): Promise<UpsertResult> {
  const supabase = createAdminClient()

  const existing = await supabase
    .from('calls')
    .select('*')
    .eq('external_call_id', input.externalCallId)
    .maybeSingle()

  if (existing.error && existing.error.code !== 'PGRST116') {
    throw new Error(`dbUpsertGhlCall lookup: ${existing.error.message}`)
  }
  if (existing.data) {
    return { call: existing.data as DbCall, isNew: false }
  }

  const { data, error } = await supabase
    .from('calls')
    .insert({
      org_id: input.orgId,
      external_call_id: input.externalCallId,
      ghl_payload: input.ghlPayload,
      ingest_source: 'ghl',
      processing_status: 'pending',
      transcript_source: 'whisper',
      trainer_name: input.trainerName,
      trainer_email: input.trainerEmail ?? '',
      client_name: input.clientName ?? null,
      lead_name: input.leadName ?? null,
      lead_source: input.leadSource ?? null,
      call_outcome: input.callOutcome ?? null,
      duration_seconds: input.durationSeconds ?? null,
      email_sent: false,
    })
    .select()
    .single()

  if (error) {
    // Corrida: outra requisição inseriu entre o lookup e o insert.
    // Reler a linha existente garante idempotência.
    if (error.code === '23505') {
      const retry = await supabase
        .from('calls')
        .select('*')
        .eq('external_call_id', input.externalCallId)
        .single()
      if (retry.data) {
        return { call: retry.data as DbCall, isNew: false }
      }
    }
    throw new Error(`dbUpsertGhlCall insert: ${error.message}`)
  }

  return { call: data as DbCall, isNew: true }
}

export interface UpdateGhlPipelineInput {
  processingStatus?: ProcessingStatus
  recordingUrl?: string | null
  transcript?: string | null
  transcriptSource?: 'whisper' | 'manual' | 'ghl'
}

export async function dbUpdateGhlCallPipeline(
  id: string,
  input: UpdateGhlPipelineInput,
): Promise<void> {
  const supabase = createAdminClient()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.processingStatus !== undefined) patch.processing_status = input.processingStatus
  if (input.recordingUrl !== undefined) patch.recording_url = input.recordingUrl
  if (input.transcript !== undefined) patch.transcript = input.transcript
  if (input.transcriptSource !== undefined) patch.transcript_source = input.transcriptSource

  const { error } = await supabase.from('calls').update(patch).eq('id', id)
  if (error) throw new Error(`dbUpdateGhlCallPipeline: ${error.message}`)
}
