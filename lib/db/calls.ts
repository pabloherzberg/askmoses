import { createAdminClient } from '@/lib/supabase/admin'

export interface DbCall {
  id: string
  org_id: string | null
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
  // Como a call chegou no sistema — added in migration 044. 'ghl' (webhook)
  // é fonte primária confiável para call_date; 'manual' (upload) é fallback.
  ingest_source?: string | null
  // GHL/Pepper CRM lead enrichment — added in migration 043
  lead_name: string | null
  lead_source: string | null
  // Script usado na análise — added in migration 056. Opcional no tipo
  // porque `select('*')` em bancos sem a migration aplicada não retorna a
  // coluna; o mapper trata `undefined` como `null`.
  script_id?: string | null
  // Buying intent 1–5 detectado pela IA — added in migration 073. Opcional
  // pelo mesmo motivo de script_id (bancos sem a migration não retornam a
  // coluna); o mapper deriva um fallback por resultado quando ausente/null.
  intent?: number | null
  // Buying intent breakdown (4 signals: financial, urgency, authority, engagement) — added in migration 084.
  // Each score 0–10, stored as JSONB. Mapped to intentBreakdown (camelCase) on the TS side.
  intent_breakdown?: Record<string, number> | null  // DB field — DO NOT use directly in TS, use intentBreakdown instead
  // Intent weights snapshot at time of analysis — added in migration 086.
  // Stores the weights (financial, urgency, authority, engagement) used during scoring.
  // NULL for calls analyzed before this migration; use current org weights as fallback.
  intent_weights?: Record<string, number> | null
  // Estado do pipeline GHL/chunks — added in migration 044. Opcional pelo
  // mesmo motivo de script_id.
  processing_status?: ProcessingStatus | null
  recording_url?: string | null
  ghl_payload?: Record<string, unknown> | null
  // GHL contactId promovido a coluna — added in migration 091.
  contact_id?: string | null
  // Id da mensagem de call no GHL — added in migration 095. Identidade real da
  // gravação; UNIQUE (org, ghl_message_id) deduplica reentregas do webhook.
  ghl_message_id?: string | null
  // Stage 2 (Actual Close / paying client) — added in migration 092.
  // stage2_outcome: paying | not_paying | pending | null. became_paying_at:
  // quando virou pagante. intent_at_close: snapshot do intent previsto (loop).
  stage2_outcome?: string | null
  became_paying_at?: string | null
  intent_at_close?: number | null
  // GHL Opportunity — added in migration 096.
  // Preenchido via webhook OpportunityStageChanged (contact_id como chave).
  ghl_opportunity_id?: string | null
  ghl_won_status?: string | null
  ghl_won_at?: string | null
}

export interface CreateCallInput {
  orgId?: string
  rubricId?: string
  scriptId?: string
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
  // Buying intent 1–5 (analyze). Quando omitido, persiste null e o mapper
  // deriva o fallback por resultado na leitura.
  intent?: number | null
  // Buying intent breakdown (4 signals with scores 0–10).
  intentBreakdown?: Record<string, number> | null
  // Intent weights snapshot at time of analysis (financial, urgency, authority, engagement).
  intentWeights?: Record<string, number> | null
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

  // Map DB snake_case to TS camelCase
  return ((data ?? []) as any[]).map(row => {
    const { intent_breakdown, intent_weights, ...rest } = row
    return {
      ...rest,
      intentBreakdown: intent_breakdown,
      intentWeights: intent_weights,
    }
  }) as unknown as DbCall[]
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

  if (!data) return null

  // Map DB snake_case to TS camelCase
  // IMPORTANT: Must explicitly omit intent_breakdown and intent_weights to prevent Next.js RSC serialization issues
  const { intent_breakdown, intent_weights, ...rest } = data as any
  const call = {
    ...rest,
    intentBreakdown: intent_breakdown,
    intentWeights: intent_weights,
  } as unknown as DbCall

  return call
}

// Atualiza o status de oportunidade GHL em todas as calls do contato na org.
// Chamado pelo webhook OpportunityStageChanged via contact_id.
export async function dbUpdateGhlOpportunity(
  orgId: string,
  contactId: string,
  opportunityId: string,
  status: string,
): Promise<void> {
  const supabase = createAdminClient()
  const normalizedStatus = status.trim().toLowerCase()
  const patch: Record<string, unknown> = {
    ghl_opportunity_id: opportunityId,
    ghl_won_status: normalizedStatus,
    ghl_won_at: normalizedStatus === 'won' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('calls')
    .update(patch)
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
  if (error) throw new Error(`dbUpdateGhlOpportunity: ${error.message}`)
}

export interface MarkStage2Input {
  stage2Outcome: 'paying' | 'not_paying' | 'pending'
  // Snapshot do Intent Index previsto no momento — comporta o loop de
  // aprendizado (intent previsto × fechou de fato). Só gravado quando vira paying.
  intentAtClose?: number | null
}

// Marca o Stage 2 (Actual Close / paying client) de uma call. Separado do
// Stage 1 (call_outcome / Initial Result). became_paying_at é setado quando
// stage2Outcome === 'paying'. Escopado por org para evitar cross-tenant write.
export async function dbMarkStage2(
  id: string,
  orgId: string,
  input: MarkStage2Input,
): Promise<DbCall | null> {
  const supabase = createAdminClient()

  const patch: Record<string, unknown> = {
    stage2_outcome: input.stage2Outcome,
    became_paying_at: input.stage2Outcome === 'paying' ? new Date().toISOString() : null,
  }
  // intent_at_close só faz sentido (e é gravado) quando vira pagante.
  if (input.stage2Outcome === 'paying' && input.intentAtClose != null) {
    patch.intent_at_close = input.intentAtClose
  }

  const { data, error } = await supabase
    .from('calls')
    .update(patch)
    .eq('id', id)
    .eq('org_id', orgId)
    .select('*')
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbMarkStage2: ${error.message}`)
  }
  if (!data) return null

  const { intent_breakdown, intent_weights, ...rest } = data as any
  return {
    ...rest,
    intentBreakdown: intent_breakdown,
    intentWeights: intent_weights,
  } as unknown as DbCall
}

export async function dbCreateCall(input: CreateCallInput): Promise<DbCall> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('calls')
    .insert({
      org_id: input.orgId ?? null,
      rubric_id: input.rubricId ?? null,
      script_id: input.scriptId ?? null,
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
      intent: input.intent ?? null,
      intent_breakdown: input.intentBreakdown ?? null,
      intent_weights: input.intentWeights ?? null,
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

/**
 * Reivindica o ghl_message_id (identidade real da gravação) para esta call.
 * Idempotência forte do pipeline: protegido pela UNIQUE (org_id, ghl_message_id)
 * da migration 095. Reentregas do mesmo webhook (ex.: sem duração e depois com
 * duração) resolvem para o mesmo messageId e a segunda perde o claim.
 *
 * Retorna:
 *   - true  → claim feito (ou já era desta mesma call: re-set idempotente).
 *   - false → outra call da org já reivindicou este messageId → é duplicata.
 */
export async function dbClaimGhlMessageId(callId: string, messageId: string): Promise<boolean> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('calls')
    .update({ ghl_message_id: messageId, updated_at: new Date().toISOString() })
    .eq('id', callId)

  if (!error) return true
  // 23505 = unique_violation: outra linha da org já tem este messageId.
  if (error.code === '23505') return false
  throw new Error(`dbClaimGhlMessageId: ${error.message}`)
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
  | 'auth_expired'
  // Pipeline de transcrição por chunks — added in migration 078.
  | 'queued_for_chunking'
  | 'chunking'
  | 'awaiting_chunks'
  | 'consolidating'
  // Call bloqueada: GHLUSERID sem vínculo a membro ativo — added in migration 096.
  | 'unlinked_trainer'

export interface CreateGhlCallInput {
  orgId: string
  externalCallId: string
  ghlPayload: Record<string, unknown>
  /** Trainer resolvido pelo webhook via (org, ghl_user_id). Ligado já na
   *  ingestão para o scoring/ranking/`/me` acharem a call sem passo extra. */
  trainerId?: string | null
  trainerName: string
  trainerEmail?: string | null
  /** GHLUSERID (payload.userId) que fez a call — guardado sempre. */
  ghlUserId?: string | null
  /** GHL contactId — chave usada pelo webhook OpportunityStageChanged
   *  (dbUpdateGhlOpportunity) para achar as calls do contato e gravar
   *  ghl_won_status. Sem isso a call nunca é encontrada quando a
   *  oportunidade fecha. */
  contactId?: string | null
  /** Estado inicial do pipeline. Default 'pending'. 'unlinked_trainer' bloqueia
   *  a análise quando o GHLUSERID não está vinculado a um membro ativo. */
  processingStatus?: ProcessingStatus
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
      processing_status: input.processingStatus ?? 'pending',
      transcript_source: 'whisper',
      trainer_name: input.trainerName,
      trainer_email: input.trainerEmail ?? '',
      trainer_id: input.trainerId ?? null,
      ghl_user_id: input.ghlUserId ?? null,
      contact_id: input.contactId ?? null,
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
  /** Atribui a call a um membro — usado na recuperação de calls bloqueadas. */
  trainerId?: string | null
  recordingUrl?: string | null
  /** Duração real medida do áudio (s). Backfill no ingest só quando o GHL não
   *  informou — evita null distorcendo o billing. */
  durationSeconds?: number | null
  transcript?: string | null
  transcriptSource?: 'whisper' | 'manual' | 'ghl'
  // Campos populados pela fase de scoring (após o transcribed).
  rubricId?: string | null
  scriptId?: string | null
  overallScore?: number | null
  detectedOutcome?: string | null
  /** Em calls vindas de webhook (sem revisão humana), espelha
   *  detectedOutcome — a UI lê esse campo como "outcome final". */
  callOutcome?: string | null
  summary?: string | null
  strengths?: string[] | null
  improvements?: string[] | null
  sections?: Record<string, unknown>[] | null
  modelUsed?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  costUsd?: number | null
  promptVersion?: string | null
  // Intent Index ponderado (0–5, decimal) = computeIntentIndex(breakdown, weights).
  intent?: number | null
  // Buying intent breakdown (4 signals).
  intentBreakdown?: Record<string, number> | null
  // Snapshot dos pesos da org no momento da análise (financial, urgency, authority, engagement).
  intentWeights?: Record<string, number> | null
  // Campos populados pela fase de coaching email (após scoring).
  emailSent?: boolean
  emailId?: string | null
}

export async function dbUpdateGhlCallPipeline(
  id: string,
  input: UpdateGhlPipelineInput,
): Promise<void> {
  const supabase = createAdminClient()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.processingStatus !== undefined) patch.processing_status = input.processingStatus
  if (input.trainerId !== undefined) patch.trainer_id = input.trainerId
  if (input.recordingUrl !== undefined) patch.recording_url = input.recordingUrl
  if (input.durationSeconds !== undefined) patch.duration_seconds = input.durationSeconds
  if (input.transcript !== undefined) patch.transcript = input.transcript
  if (input.transcriptSource !== undefined) patch.transcript_source = input.transcriptSource
  if (input.rubricId !== undefined) patch.rubric_id = input.rubricId
  if (input.scriptId !== undefined) patch.script_id = input.scriptId
  if (input.overallScore !== undefined) patch.overall_score = input.overallScore
  if (input.detectedOutcome !== undefined) patch.detected_outcome = input.detectedOutcome
  if (input.callOutcome !== undefined) patch.call_outcome = input.callOutcome
  if (input.summary !== undefined) patch.summary = input.summary
  if (input.strengths !== undefined) patch.strengths = input.strengths
  if (input.improvements !== undefined) patch.improvements = input.improvements
  if (input.sections !== undefined) patch.sections = input.sections
  if (input.modelUsed !== undefined) patch.model_used = input.modelUsed
  if (input.inputTokens !== undefined) patch.input_tokens = input.inputTokens
  if (input.outputTokens !== undefined) patch.output_tokens = input.outputTokens
  if (input.costUsd !== undefined) patch.cost_usd = input.costUsd
  if (input.promptVersion !== undefined) patch.prompt_version = input.promptVersion
  if (input.intent !== undefined) patch.intent = input.intent
  if (input.intentBreakdown !== undefined) patch.intent_breakdown = input.intentBreakdown
  if (input.intentWeights !== undefined) patch.intent_weights = input.intentWeights
  if (input.emailSent !== undefined) patch.email_sent = input.emailSent
  if (input.emailId !== undefined) patch.email_id = input.emailId

  const { error } = await supabase.from('calls').update(patch).eq('id', id)
  if (error) throw new Error(`dbUpdateGhlCallPipeline: ${error.message}`)
}

/** Call bloqueada por falta de vínculo — o mínimo pra reprocessar (id + payload). */
export interface UnlinkedCallRow {
  id: string
  ghl_payload: Record<string, unknown> | null
}

/**
 * Calls de uma org que entraram BLOQUEADAS (processing_status='unlinked_trainer')
 * por terem sido feitas por um determinado GHLUSERID. A recuperação automática
 * usa isso pra reprocessar quando o GHLUSERID vira um membro ativo.
 */
export async function dbGetUnlinkedCallsByGhlUser(
  orgId: string,
  ghlUserId: string,
): Promise<UnlinkedCallRow[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('calls')
    .select('id, ghl_payload')
    .eq('org_id', orgId)
    .eq('ghl_user_id', ghlUserId)
    .eq('processing_status', 'unlinked_trainer')

  if (error) throw new Error(`dbGetUnlinkedCallsByGhlUser: ${error.message}`)
  return (data ?? []) as UnlinkedCallRow[]
}
