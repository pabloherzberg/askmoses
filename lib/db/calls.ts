import { createAdminClient } from '@/lib/supabase/admin'
import { notifyPipelineFailure } from '@/lib/services/pipeline-alerts'
import { applySalesCallOnly } from '@/lib/sales-calls'

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
  // GHLUSERID (payload.userId) que fez a call — added in migration 096. Sempre
  // gravado, vinculado ou não: é a chave da migração das calls do Front Desk
  // pro rep real. NULL = payload do GHL sem userId (call não reatribuível) ou
  // call anterior à 096. Opcional pelo mesmo motivo de script_id.
  ghl_user_id?: string | null
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
  // Gate de classificação — added in migration 104. true = call de venda,
  // análise completa. false = não é venda, sem scores/strengths/improvements/
  // detectedOutcome. null = call analisada antes desta migration (legado,
  // não classificada — diferente de false).
  is_sales_call?: boolean | null
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
  // Gate de classificação (migration 104). Quando omitido, persiste null
  // (call legada / não classificada).
  isSalesCall?: boolean | null
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
  /**
   * Exclui calls classificadas como NÃO-venda (is_sales_call = false).
   * Opt-in: listagens (/calls, /dashboard/history) precisam exibir essas
   * calls com o badge "não é venda", então o default é NÃO filtrar. Toda
   * agregação de métrica deve passar `salesOnly: true`.
   * Ver lib/sales-calls.ts para a semântica de NULL.
   */
  salesOnly?: boolean
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
  if (filters?.salesOnly) query = applySalesCallOnly(query)
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
// Chamado pelo webhook OpportunityStageChanged e pelo cron
// sync-ghl-opportunities, ambos via contact_id.
//
// Retorna quantas calls foram casadas. Casar ZERO é um resultado legítimo (o
// contato pode não ter nenhuma call ingerida: lead que só agendou, call < 30s
// cortada no webhook, call de vendedor não vinculado). Mas era exatamente assim
// que o bug do contact_id NULL se escondia — o UPDATE não casava nada, ninguém
// olhava, e o webhook respondia 200. Devolver o count força o caller a decidir.
//
// ghl_won_at só é gravado quando a call ENTRA em won (status anterior diferente
// de 'won') ou quando ainda está NULL. Antes era regravado com now() a cada
// sync — e o cron sincroniza todas as won todo dia, então a coluna virava
// "última vez que vimos won". `statusChangedAt` é a data da mudança de status
// vinda do GHL (lastStatusChangeAt), quando o payload traz; senão, now().
//
// Status 'won' também marca o Stage 2 (paying) numa call do contato, via
// mark_stage2_paying_from_won (migration 117). Status diferente de 'won' não
// mexe no Stage 2.
export async function dbUpdateGhlOpportunity(
  orgId: string,
  contactId: string,
  opportunityId: string,
  status: string,
  statusChangedAt?: string | null,
): Promise<number> {
  const supabase = createAdminClient()
  const normalizedStatus = status.trim().toLowerCase()
  const isWon = normalizedStatus === 'won'

  if (isWon) {
    const { error: wonAtError } = await supabase
      .from('calls')
      .update({ ghl_won_at: resolveStatusChangedAt(statusChangedAt) })
      .eq('org_id', orgId)
      .eq('contact_id', contactId)
      .or('ghl_won_at.is.null,ghl_won_status.is.null,ghl_won_status.neq.won')
    if (wonAtError) throw new Error(`dbUpdateGhlOpportunity (ghl_won_at): ${wonAtError.message}`)
  }

  const patch: Record<string, unknown> = {
    ghl_opportunity_id: opportunityId,
    ghl_won_status: normalizedStatus,
    updated_at: new Date().toISOString(),
  }
  if (!isWon) patch.ghl_won_at = null
  const { error, count } = await supabase
    .from('calls')
    .update(patch, { count: 'exact' })
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
  if (error) throw new Error(`dbUpdateGhlOpportunity: ${error.message}`)

  if (isWon) await markStage2PayingFromWon(supabase, orgId, contactId, opportunityId)

  return count ?? 0
}

// Stage 2 é derivado do WON — falhar aqui não pode derrubar o sync do status
// (o webhook responderia 500 e o GHL reenviaria um evento já gravado). Loga,
// alerta e segue; o próximo sync do mesmo contato tenta de novo, e a função
// é idempotente.
async function markStage2PayingFromWon(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  contactId: string,
  opportunityId: string,
): Promise<void> {
  let failure: unknown = null
  try {
    const { error } = await supabase.rpc('mark_stage2_paying_from_won', {
      p_org_id: orgId,
      p_contact_id: contactId,
    })
    if (error) failure = new Error(`mark_stage2_paying_from_won: ${error.message}`)
  } catch (err) {
    failure = err
  }
  if (!failure) return

  console.error('[dbUpdateGhlOpportunity] Stage 2 não marcado', { orgId, contactId, opportunityId, err: failure })
  await notifyPipelineFailure('webhook_failed', {
    callId: `sync-error:stage2:${opportunityId}`,
    orgId,
    contactId,
    error: failure,
    stage: 'webhook',
    reason: 'db_error',
    meta: { operation: 'mark_stage2_paying_from_won', contactId, opportunityId },
  }).catch(() => {})
}

// Data da mudança de status vinda do GHL, se for um timestamp válido; senão now().
function resolveStatusChangedAt(raw: string | null | undefined): string {
  if (raw) {
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return new Date().toISOString()
}

// Já existe alguma call WON para este contato na org? Usado pelo webhook do
// GHL para rejeitar novas calls de um lead que já fechou — depois do Won,
// dbUpdateGhlOpportunity carimba ghl_won_status='won' em TODAS as calls do
// contato, então basta achar UMA linha pra saber que o lead está fechado.
export async function dbHasWonCall(orgId: string, contactId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('calls')
    .select('id')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .eq('ghl_won_status', 'won')
    .limit(1)
  if (error) throw new Error(`dbHasWonCall: ${error.message}`)
  return (data?.length ?? 0) > 0
}

// contact_ids distintos das calls da org criadas nos últimos `days` dias.
// É o universo que o sync de agendamentos precisa varrer: só faz sentido puxar
// a agenda de quem tem call ingerida — mesma chave (contact_id) que o fluxo do
// Won usa pra casar opportunity → calls.
export async function dbListRecentContactIds(
  orgId: string,
  days: number,
): Promise<string[]> {
  const supabase = createAdminClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('calls')
    .select('contact_id')
    .eq('org_id', orgId)
    .not('contact_id', 'is', null)
    .gte('created_at', since)

  if (error) throw new Error(`dbListRecentContactIds: ${error.message}`)

  const ids = new Set<string>()
  for (const row of (data ?? []) as Array<{ contact_id: string | null }>) {
    if (row.contact_id) ids.add(row.contact_id)
  }
  return Array.from(ids)
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
      is_sales_call: input.isSalesCall ?? null,
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
  /** contactId do GHL — chave dos joins com appointments e com o webhook de
   *  oportunidade (Stage 2 / paying client). Ver migration 091. */
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
  // Gate de classificação (migration 104).
  isSalesCall?: boolean | null
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
  if (input.isSalesCall !== undefined) patch.is_sales_call = input.isSalesCall

  const { error } = await supabase.from('calls').update(patch).eq('id', id)
  if (error) throw new Error(`dbUpdateGhlCallPipeline: ${error.message}`)
}

/** Close rate global da org — ver dbGetOrgCloseRate. */
export interface OrgCloseRate {
  /** Todas as calls da org (denominador). */
  totalCalls: number
  /** Subconjunto de totalCalls com call_outcome='closed' (numerador). */
  closedCalls: number
  /** closedCalls / totalCalls em %, inteiro. 0 quando a org não tem calls. */
  closeRate: number
}

/**
 * Close rate da org inteira, contado das calls — não da média dos trainers.
 * A média por trainer dava peso igual a quem fez 1 call e a quem fez 50; aqui
 * cada call pesa o mesmo.
 *
 * Regra deliberadamente simples: denominador = TODAS as calls da org, sem
 * exceção. Entram também as que ainda não têm desfecho — não analisadas
 * (transcription_failed, no_recording, pending) ou sem outcome confirmado.
 * O trade-off é conhecido e aceito: falha de pipeline derruba o close rate.
 * Se o número cair sem explicação de venda, é aqui que se olha primeiro.
 *
 * Global e sem recorte de período: todas as calls da org desde sempre.
 * Usa count-only (head: true) — nenhuma linha trafega.
 */
export async function dbGetOrgCloseRate(orgId: string): Promise<OrgCloseRate> {
  const supabase = createAdminClient()

  // salesOnly nas DUAS contagens: é o card "Avg Close Rate" do /dashboard e a
  // base do insight de ROI. Calls não-venda têm call_outcome NULL — sem o
  // filtro no total, elas inflariam só o denominador e derrubariam o close
  // rate. O filtro precisa bater com o de syncTrainerStats pra os números
  // do dashboard e do leaderboard fecharem.
  const [total, closed] = await Promise.all([
    applySalesCallOnly(
      supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId),
    ),
    applySalesCallOnly(
      supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('call_outcome', 'closed'),
    ),
  ])

  if (total.error) throw new Error(`dbGetOrgCloseRate(total): ${total.error.message}`)
  if (closed.error) throw new Error(`dbGetOrgCloseRate(closed): ${closed.error.message}`)

  const totalCalls = total.count ?? 0
  const closedCalls = closed.count ?? 0

  return {
    totalCalls,
    closedCalls,
    closeRate: totalCalls > 0 ? Math.round((closedCalls / totalCalls) * 100) : 0,
  }
}

/** Won rate — ver dbGetOrgWonRate. Contado por LEAD, nunca por call. */
export interface WonRate {
  /** Leads (contact_id distintos) com ao menos uma call 'closed' — denominador. */
  closedLeads: number
  /** Subconjunto de closedLeads que também tem ghl_won_status='won' — numerador. */
  wonLeads: number
  /** wonLeads / closedLeads em %, inteiro. 0 quando não há lead com 'closed'. */
  wonRate: number
}

export interface OrgWonRate extends WonRate {
  /** Mesmo cálculo recortado por vendedor. Chave = trainers.id. */
  byTrainer: Record<string, WonRate>
}

function toWonRate(closedLeads: unknown, wonLeads: unknown): WonRate {
  // bigint do Postgres chega como number no JSON do PostgREST, mas em orgs
  // grandes pode vir como string — Number() cobre os dois.
  const closed = Number(closedLeads) || 0
  const won = Number(wonLeads) || 0
  return {
    closedLeads: closed,
    wonLeads: won,
    wonRate: closed > 0 ? Math.round((won / closed) * 100) : 0,
  }
}

/**
 * Won rate da org e de cada vendedor: leads que fecharam venda ÷ leads que
 * agendaram avaliação (`call_outcome='closed'` — Stage 1 do funil).
 *
 * Toda a contagem é por LEAD (`contact_id` distinto), não por call. Um lead
 * com 6 ligações e 1 venda conta como 1/1, não 6/6 — dbUpdateGhlOpportunity
 * carimba `ghl_won_status` em todas as calls do contato, e contar call faria
 * o rate estourar 100%. Ver scripts/107_org_won_rate.sql para o raciocínio
 * completo.
 *
 * Calls sem `contact_id` (upload manual, GHL anterior ao backfill 102) ficam
 * fora dos DOIS lados — entram no close rate, que conta call, mas não aqui.
 * É por isso que os denominadores das duas métricas não batem.
 *
 * `byTrainer[id]` responde "das avaliações que ELE agendou, quantas viraram
 * venda" — qualidade do agendamento, não crédito pelo fechamento (o closer
 * pode ser outra pessoa). A soma dos vendedores não reproduz o total da org:
 * um lead atendido por dois conta uma vez em cada e uma vez só na org.
 *
 * Global e sem recorte de período, igual a dbGetOrgCloseRate.
 */
export async function dbGetOrgWonRate(orgId: string): Promise<OrgWonRate> {
  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('org_won_rate', { p_org_id: orgId })
  if (error) throw new Error(`dbGetOrgWonRate: ${error.message}`)

  const rows = (data ?? []) as Array<{
    trainer_id: string | null
    closed_leads: number | string
    won_leads: number | string
  }>

  let org: WonRate = { closedLeads: 0, wonLeads: 0, wonRate: 0 }
  const byTrainer: Record<string, WonRate> = {}

  for (const row of rows) {
    const entry = toWonRate(row.closed_leads, row.won_leads)
    if (row.trainer_id === null) org = entry
    else byTrainer[row.trainer_id] = entry
  }

  return { ...org, byTrainer }
}

// ─── Reatribuição do Front Desk → rep real ───────────────────────────────────
// Substitui a recuperação da 096. Lá a call entrava BLOQUEADA
// (processing_status='unlinked_trainer') e o vínculo disparava o pipeline
// inteiro do zero. Aqui ela já entrou, foi transcrita e pontuada sob o Front
// Desk — reatribuir é trocar trainer_id e ressincronizar os dois reps.
//
// O leitor daquele estado (dbGetUnlinkedCallsByGhlUser) foi removido junto: nada
// escreve 'unlinked_trainer' desde 02/07, e uma função exportada com nome
// plausível filtrando por um status morto é convite a chamá-la sem efeito.

/** Status em que o pipeline ainda está mexendo na call. Reatribuir no meio
 *  disso intercalaria dois syncTrainerStats concorrentes no mesmo rep — a call
 *  fica pro próximo gatilho, que é barato e idempotente. */
const IN_FLIGHT_STATUSES: ProcessingStatus[] = [
  'pending',
  'processing',
  'queued_for_chunking',
  'chunking',
  'awaiting_chunks',
  'consolidating',
]

/** Call do Front Desk candidata a reatribuição. */
export interface FrontDeskCallRow {
  id: string
  processing_status: ProcessingStatus | null
}

/** A call está em voo no pipeline (não reatribuir agora)? */
export function isInFlightCall(status: ProcessingStatus | null): boolean {
  return status != null && IN_FLIGHT_STATUSES.includes(status)
}

/**
 * Calls atribuídas ao Front Desk da org que foram feitas por um GHLUSERID
 * específico — as candidatas a migrar pro rep real quando ele for vinculado.
 *
 * O recorte é (trainer_id do Front Desk, ghl_user_id), não processing_status:
 * é o índice calls_trainer_ghl_user_idx da 109. Call sem ghl_user_id (payload
 * do GHL sem userId) nunca casa aqui — não há a quem atribuir, e é por isso
 * que ela fica no Front Desk em definitivo.
 */
export async function dbGetFrontDeskCallsByGhlUser(
  orgId: string,
  frontDeskTrainerId: string,
  ghlUserId: string,
): Promise<FrontDeskCallRow[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('calls')
    .select('id, processing_status')
    .eq('org_id', orgId)
    .eq('trainer_id', frontDeskTrainerId)
    .eq('ghl_user_id', ghlUserId)

  if (error) throw new Error(`dbGetFrontDeskCallsByGhlUser: ${error.message}`)
  return (data ?? []) as FrontDeskCallRow[]
}

export interface ReassignTrainerInput {
  trainerId: string
  /** users.name do rep real — substitui o nome cru do payload, que no Front
   *  Desk era a única pista de quem falou e agora deixa de ser necessário. */
  trainerName: string
  trainerEmail?: string | null
}

/**
 * Troca o rep de um lote de calls. Um único UPDATE — o `.in()` mantém a
 * operação atômica, então não existe estado intermediário em que metade das
 * calls migrou.
 *
 * O bump de `updated_at` é o que faz o carimbo semanal (stamp_call_stats_weekly,
 * migration 107) reprocessar as semanas afetadas no próximo run e mover a call
 * de rep também no histórico — sem ele o call_stats_weekly continuaria contando
 * a call sob o Front Desk. Quem garante esse bump é o trigger
 * `trg_calls_updated_at` (107), incondicional em todo UPDATE de `calls`, que
 * inclusive sobrescreve o que a aplicação mandar. O campo aqui é redundância
 * deliberada: segue a convenção de todos os outros caminhos de UPDATE do
 * arquivo, mas NÃO é ele que sustenta o carimbo.
 *
 * Devolve quantas linhas mudaram.
 */
export async function dbReassignCallsToTrainer(
  callIds: string[],
  input: ReassignTrainerInput,
): Promise<number> {
  if (callIds.length === 0) return 0

  const supabase = createAdminClient()

  const patch: Record<string, unknown> = {
    trainer_id: input.trainerId,
    trainer_name: input.trainerName,
    updated_at: new Date().toISOString(),
  }
  // Só sobrescreve o email quando temos um real — o do payload pode ser a
  // única forma de contato registrada na call.
  if (input.trainerEmail) patch.trainer_email = input.trainerEmail

  const { data, error } = await supabase
    .from('calls')
    .update(patch)
    .in('id', callIds)
    .select('id')

  if (error) throw new Error(`dbReassignCallsToTrainer: ${error.message}`)
  return (data ?? []).length
}
