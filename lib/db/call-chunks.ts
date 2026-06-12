import { createAdminClient } from '@/lib/supabase/admin'

// ────────────────────────────────────────────────────────────────────────────
// Fila de transcrição por chunks (migrations 077-079).
//
// Calls grandes são cortadas no ingest e enfileiradas em `call_chunks`; o
// worker (Vercel Cron · /api/cron/process-chunks) drena a fila com claim
// atômico (RPC claim_chunks · SKIP LOCKED), transcreve cada chunk e a
// consolidação remonta calls.transcript. O áudio é transitório — só o texto
// final persiste.
// ────────────────────────────────────────────────────────────────────────────

export type ChunkStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface DbCallChunk {
  id: string
  call_id: string
  org_id: string | null
  chunk_index: number
  start_ms: number | null
  end_ms: number | null
  overlap_ms: number
  storage_path: string | null
  mime_type: string
  status: ChunkStatus
  transcript: string | null
  attempts: number
  last_error: string | null
  transcription_cost_usd: number | null
  next_attempt_at: string
  created_at: string
  updated_at: string
}

export interface NewChunkInput {
  chunkIndex: number
  startMs: number
  endMs: number
  overlapMs: number
  storagePath: string
  mimeType?: string
}

/**
 * Insere todos os chunks de uma call de uma vez. Idempotente via UNIQUE
 * (call_id, chunk_index): re-enfileirar a mesma call não duplica — ON CONFLICT
 * ignora os que já existem (caso um retry de chunking re-rode após inserir
 * parcialmente).
 */
export async function dbCreateChunks(
  callId: string,
  orgId: string | null,
  chunks: NewChunkInput[],
): Promise<void> {
  if (chunks.length === 0) return
  const supabase = createAdminClient()

  const rows = chunks.map((c) => ({
    call_id: callId,
    org_id: orgId,
    chunk_index: c.chunkIndex,
    start_ms: c.startMs,
    end_ms: c.endMs,
    overlap_ms: c.overlapMs,
    storage_path: c.storagePath,
    mime_type: c.mimeType ?? 'audio/mpeg',
    status: 'pending' as ChunkStatus,
  }))

  const { error } = await supabase
    .from('call_chunks')
    .upsert(rows, { onConflict: 'call_id,chunk_index', ignoreDuplicates: true })

  if (error) throw new Error(`dbCreateChunks: ${error.message}`)
}

/**
 * Claim atômico via RPC (077-079, estendido na 083). Marca até `batch` chunks
 * como 'processing' (incrementando attempts) e os retorna pro worker.
 * `staleSeconds` recupera chunks travados em 'processing' (função morreu sem
 * finalizar). `maxInflight` é o teto GLOBAL de 'processing' simultâneos —
 * cadeias de worker se sobrepõem, e sem o teto a concorrência contra a OpenAI
 * é batch × nº de cadeias. Só elegem chunks com next_attempt_at vencido
 * (backoff de 429/quota).
 */
export async function dbClaimChunks(
  batch: number,
  staleSeconds = 300,
  maxInflight: number | null = null,
): Promise<DbCallChunk[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('claim_chunks', {
    p_batch: batch,
    p_stale_seconds: staleSeconds,
    p_max_inflight: maxInflight,
  })

  if (error) throw new Error(`dbClaimChunks: ${error.message}`)
  return (data ?? []) as DbCallChunk[]
}

/** Todos os chunks de uma call, em ordem — usado pela consolidação. */
export async function dbGetChunksForCall(callId: string): Promise<DbCallChunk[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('call_chunks')
    .select('*')
    .eq('call_id', callId)
    .order('chunk_index', { ascending: true })

  if (error) throw new Error(`dbGetChunksForCall: ${error.message}`)
  return (data ?? []) as DbCallChunk[]
}

export interface ChunkStatusCounts {
  total: number
  pending: number
  processing: number
  done: number
  failed: number
}

/**
 * Conta chunks por status pra uma call. O worker usa pra decidir se a call
 * está pronta pra consolidar (done === total e failed === 0) ou se deve ser
 * marcada como failed (qualquer chunk failed). São poucas linhas por call
 * (dezenas), então conta em memória em vez de um aggregate no banco.
 */
export async function dbGetChunkStatusCounts(callId: string): Promise<ChunkStatusCounts> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('call_chunks')
    .select('status')
    .eq('call_id', callId)

  if (error) throw new Error(`dbGetChunkStatusCounts: ${error.message}`)

  const counts: ChunkStatusCounts = {
    total: 0,
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
  }
  for (const row of data ?? []) {
    counts.total += 1
    counts[(row as { status: ChunkStatus }).status] += 1
  }
  return counts
}

/** Marca um chunk como transcrito com sucesso. */
export async function dbMarkChunkDone(
  id: string,
  transcript: string,
  costUsd: number | null,
): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('call_chunks')
    .update({
      status: 'done',
      transcript,
      transcription_cost_usd: costUsd,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw new Error(`dbMarkChunkDone: ${error.message}`)
}

/**
 * Falha de transcrição num chunk: se ainda há tentativas (attempts <
 * maxAttempts), volta pra 'pending' pro próximo claim retentar; senão,
 * aposenta em 'failed'. `attempts` já foi incrementado no claim, então
 * comparamos o valor atual da linha. Retorna o status final aplicado.
 *
 * `delaySeconds` agenda o retry: o claim (083) só re-reivindica o chunk após
 * `next_attempt_at`. Essencial pra 429 — sem o delay, o worker auto-drenante
 * re-pega o chunk em segundos, dentro da mesma janela de rate limit.
 */
export async function dbRetryOrFailChunk(
  chunk: DbCallChunk,
  errorMessage: string,
  maxAttempts: number,
  delaySeconds = 0,
): Promise<'pending' | 'failed'> {
  const supabase = createAdminClient()
  const next: 'pending' | 'failed' = chunk.attempts >= maxAttempts ? 'failed' : 'pending'

  const { error } = await supabase
    .from('call_chunks')
    .update({
      status: next,
      last_error: errorMessage.slice(0, 1000),
      next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', chunk.id)

  if (error) throw new Error(`dbRetryOrFailChunk: ${error.message}`)
  return next
}

/**
 * Aposenta os chunks ainda 'pending' de uma call que já falhou. Sem isto, a
 * fila continuaria reivindicando trabalho de uma call morta: o download
 * falharia (o áudio é removido junto com a falha da call) e cada chunk
 * queimaria todas as tentativas — invocações e alertas à toa.
 */
export async function dbFailPendingChunksForCall(
  callId: string,
  reason: string,
): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('call_chunks')
    .update({
      status: 'failed' as ChunkStatus,
      last_error: reason.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq('call_id', callId)
    .eq('status', 'pending')

  if (error) throw new Error(`dbFailPendingChunksForCall: ${error.message}`)
}

/**
 * Existe trabalho de transcrição na fila? True se há chunks 'pending' ou
 * 'processing'. Usado pela rede de segurança (cron de 15min) pra decidir se
 * vale cutucar o worker. Conta só o head (não traz linhas).
 */
export async function dbHasPendingChunkWork(): Promise<boolean> {
  const supabase = createAdminClient()

  const { count, error } = await supabase
    .from('call_chunks')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'processing'])

  if (error) throw new Error(`dbHasPendingChunkWork: ${error.message}`)
  return (count ?? 0) > 0
}

/** Atualiza o progresso de chunking exibido na call (chunk_total / chunks_done). */
export async function dbSetCallChunkProgress(
  callId: string,
  progress: { chunkTotal?: number; chunksDone?: number },
): Promise<void> {
  const supabase = createAdminClient()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (progress.chunkTotal !== undefined) patch.chunk_total = progress.chunkTotal
  if (progress.chunksDone !== undefined) patch.chunks_done = progress.chunksDone

  const { error } = await supabase.from('calls').update(patch).eq('id', callId)
  if (error) throw new Error(`dbSetCallChunkProgress: ${error.message}`)
}

/**
 * Claim atômico da call pra consolidação: muda 'awaiting_chunks' →
 * 'consolidating' SÓ se ainda estiver em 'awaiting_chunks'. Retorna true se
 * este run ganhou o claim; false se outro run já pegou (UPDATE não afetou
 * nenhuma linha). Evita consolidação dupla quando cron runs se sobrepõem.
 */
export async function dbClaimCallForConsolidation(callId: string): Promise<boolean> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('calls')
    .update({ processing_status: 'consolidating', updated_at: new Date().toISOString() })
    .eq('id', callId)
    .eq('processing_status', 'awaiting_chunks')
    .select('id')

  if (error) throw new Error(`dbClaimCallForConsolidation: ${error.message}`)
  return (data ?? []).length > 0
}

/**
 * Auditoria leve pós-consolidação: zera o payload de áudio/texto dos chunks
 * concluídos (transcript + storage_path), preservando a linha como índice
 * (status, janela de tempo). Não toca em chunks 'failed' — eles ficam com o
 * erro pra debug.
 */
export async function dbClearChunkPayloads(callId: string): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('call_chunks')
    .update({
      transcript: null,
      storage_path: null,
      updated_at: new Date().toISOString(),
    })
    .eq('call_id', callId)
    .eq('status', 'done')

  if (error) throw new Error(`dbClearChunkPayloads: ${error.message}`)
}
