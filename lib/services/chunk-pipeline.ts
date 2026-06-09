import {
  dbClaimCallForConsolidation,
  dbClearChunkPayloads,
  dbCreateChunks,
  dbGetChunkStatusCounts,
  dbGetChunksForCall,
  dbRetryOrFailChunk,
  dbMarkChunkDone,
  dbSetCallChunkProgress,
  type DbCallChunk,
} from '@/lib/db/call-chunks'
import { dbGetCallById, dbUpdateGhlCallPipeline } from '@/lib/db/calls'
import {
  chunkAudio,
  DEFAULT_CHUNK_OPTIONS,
  type ChunkOptions,
} from '@/lib/services/audio-chunker'
import {
  chunkStoragePath,
  deleteAllChunkAudioForCall,
  deleteChunkAudio,
  getChunkAudio,
  putChunkAudio,
} from '@/lib/services/call-audio-storage'
import { runGhlCallScoring } from '@/lib/services/ghl-call-scoring'
import { sendGhlCoachingEmail } from '@/lib/services/ghl-coaching-email'
import { notifyPipelineFailure } from '@/lib/services/pipeline-alerts'
import { stitchChunkTranscripts } from '@/lib/services/transcript-stitcher'
import { diarizeTranscript } from '@/lib/services/whisper'
import { transcribeAudioBuffer } from '@/lib/services/whisper'

// ────────────────────────────────────────────────────────────────────────────
// Orquestração do pipeline de transcrição por chunks (Fase 3).
//
//   chunkAndEnqueueCall  — ingest: corta o áudio, sobe os chunks no Storage,
//                          enfileira em call_chunks. (disparado via waitUntil)
//   transcribeChunk      — worker: transcreve UM chunk e o finaliza.
//   finalizeCallIfReady  — worker: quando todos os chunks de uma call estão
//                          done, costura + diariza + grava transcript + dispara
//                          scoring/email (reusa runGhlCallScoring, que serve
//                          qualquer call com transcript+org).
// ────────────────────────────────────────────────────────────────────────────

/**
 * Dispara o worker da fila (fire-and-forget). A fila é auto-drenante por
 * eventos, SEM cron próprio: o ingest chama isto após enfileirar, e o próprio
 * worker chama de novo enquanto sobra trabalho. O cron existente
 * (recover-stale-analyses, 15min) também chama como rede de segurança caso um
 * elo da cadeia morra. Idempotente — chamadas concorrentes só competem pelo
 * claim atômico (SKIP LOCKED), nunca duplicam transcrição.
 */
export function kickChunkWorker(): void {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  void fetch(`${baseUrl}/api/calls/process-chunks`, {
    method: 'POST',
    headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' },
  }).catch((err) => {
    console.error('[chunk-pipeline] kickChunkWorker falhou:', err)
  })
}

/** Whisper-1: US$0.006 por minuto de áudio. */
const WHISPER_USD_PER_MINUTE = 0.006

/** Teto de tentativas por chunk antes de aposentar em 'failed'. */
export const MAX_CHUNK_ATTEMPTS = 3

function whisperChunkCost(chunk: DbCallChunk): number {
  if (chunk.start_ms == null || chunk.end_ms == null) return 0
  const minutes = (chunk.end_ms - chunk.start_ms) / 60_000
  return Number((minutes * WHISPER_USD_PER_MINUTE).toFixed(6))
}

export interface ChunkAndEnqueueInput {
  callId: string
  orgId: string | null
  audio: Buffer
  mimeType: string
  options?: ChunkOptions
}

/**
 * Corta o áudio em chunks sobrepostos, sobe cada um no Storage e enfileira.
 * Move a call: 'chunking' → 'awaiting_chunks'. Em erro, marca
 * 'transcription_failed' e alerta. O áudio original NÃO é persistido — vive só
 * no buffer recebido e é descartado quando esta função retorna.
 */
export async function chunkAndEnqueueCall(input: ChunkAndEnqueueInput): Promise<void> {
  const { callId, orgId, audio, mimeType } = input
  const options = input.options ?? DEFAULT_CHUNK_OPTIONS

  await dbUpdateGhlCallPipeline(callId, { processingStatus: 'chunking' })

  try {
    const chunks = await chunkAudio(audio, options)
    if (chunks.length === 0) {
      throw new Error('chunkAudio não produziu nenhum chunk')
    }

    // Sobe os arquivos primeiro; só então enfileira as linhas. Se um upload
    // falhar, a fila não fica apontando pra arquivo inexistente.
    const inputs = []
    for (const chunk of chunks) {
      const path = chunkStoragePath(callId, chunk.chunkIndex)
      await putChunkAudio(path, chunk.buffer, chunk.mimeType)
      inputs.push({
        chunkIndex: chunk.chunkIndex,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        overlapMs: chunk.overlapMs,
        storagePath: path,
        mimeType: chunk.mimeType,
      })
    }

    await dbCreateChunks(callId, orgId, inputs)
    await dbSetCallChunkProgress(callId, { chunkTotal: chunks.length, chunksDone: 0 })
    await dbUpdateGhlCallPipeline(callId, { processingStatus: 'awaiting_chunks' })
  } catch (err) {
    console.error('[chunk-pipeline] chunkAndEnqueueCall falhou', {
      callId,
      err: err instanceof Error ? err.message : String(err),
    })
    await dbUpdateGhlCallPipeline(callId, { processingStatus: 'transcription_failed' })
    await notifyPipelineFailure('transcription_failed', { callId, orgId: orgId ?? undefined, error: err })
    throw err
  }
}

/**
 * Transcreve UM chunk reivindicado (status já 'processing' pelo claim). Baixa o
 * mp3, roda Whisper SEM diarização (a diarização é 1x no fim), e finaliza:
 *   - sucesso → done + custo + deleta o arquivo do Storage.
 *   - falha   → retry (volta pra pending) ou failed após o teto.
 * Retorna o callId tocado pra o worker saber quais calls checar pra finalizar.
 */
export async function transcribeChunk(chunk: DbCallChunk): Promise<string> {
  try {
    if (!chunk.storage_path) {
      throw new Error('chunk sem storage_path')
    }
    const audio = await getChunkAudio(chunk.storage_path)
    const transcript = await transcribeAudioBuffer(audio, chunk.mime_type, {
      diarize: false,
      filename: `chunk-${chunk.chunk_index}.mp3`,
    })

    await dbMarkChunkDone(chunk.id, transcript, whisperChunkCost(chunk))
    await deleteChunkAudio(chunk.storage_path)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const result = await dbRetryOrFailChunk(chunk, msg, MAX_CHUNK_ATTEMPTS)
    console.warn('[chunk-pipeline] transcribeChunk falhou', {
      chunkId: chunk.id,
      callId: chunk.call_id,
      attempt: chunk.attempts,
      next: result,
      err: msg,
    })
  }
  return chunk.call_id
}

/**
 * Se todos os chunks de uma call estão done, consolida: costura + diariza +
 * grava transcript, dispara scoring/email e limpa o Storage. Se algum chunk
 * está failed, marca a call como transcription_failed. Idempotente e seguro sob
 * concorrência via claim atômico (awaiting_chunks → consolidating).
 */
export async function finalizeCallIfReady(callId: string): Promise<void> {
  const counts = await dbGetChunkStatusCounts(callId)
  if (counts.total === 0) return // ainda não foi chunkada

  // Atualiza o progresso visível mesmo que ainda não esteja pronta.
  await dbSetCallChunkProgress(callId, { chunksDone: counts.done }).catch(() => {})

  if (counts.failed > 0) {
    await dbUpdateGhlCallPipeline(callId, { processingStatus: 'transcription_failed' })
    await deleteAllChunkAudioForCall(callId)
    await notifyPipelineFailure('transcription_failed', {
      callId,
      error: new Error(`${counts.failed}/${counts.total} chunks falharam`),
    })
    return
  }

  if (counts.done < counts.total) return // ainda transcrevendo

  // Claim atômico — só um run consolida.
  const claimed = await dbClaimCallForConsolidation(callId)
  if (!claimed) return

  try {
    const call = await dbGetCallById(callId)
    const chunks = await dbGetChunksForCall(callId)

    const stitched = stitchChunkTranscripts(
      chunks.map((c) => ({
        chunkIndex: c.chunk_index,
        transcript: c.transcript,
        overlapMs: c.overlap_ms,
      })),
    )

    let finalTranscript = stitched
    try {
      finalTranscript = await diarizeTranscript(stitched, {
        trainerName: call?.trainer_name ?? undefined,
        clientName: call?.client_name ?? undefined,
      })
    } catch (err) {
      console.warn('[chunk-pipeline] diarização falhou, usando texto sem labels', {
        callId,
        err: err instanceof Error ? err.message : String(err),
      })
    }

    await dbUpdateGhlCallPipeline(callId, {
      transcript: finalTranscript,
      transcriptSource: 'whisper',
      processingStatus: 'transcribed',
    })

    // Áudio cumpriu seu papel — remove tudo do Storage e zera os payloads.
    await dbClearChunkPayloads(callId)
    await deleteAllChunkAudioForCall(callId)
  } catch (err) {
    console.error('[chunk-pipeline] consolidação falhou', {
      callId,
      err: err instanceof Error ? err.message : String(err),
    })
    await dbUpdateGhlCallPipeline(callId, { processingStatus: 'transcription_failed' })
    await notifyPipelineFailure('transcription_failed', { callId, error: err })
    return
  }

  // Fanout pós-transcribed: scoring + coaching email. Best-effort, idêntico ao
  // tail do processGhlCall — erros não afetam o transcript já salvo.
  try {
    await runGhlCallScoring(callId)
  } catch (err) {
    console.error('[chunk-pipeline] scoring falhou (non-fatal)', {
      callId,
      err: err instanceof Error ? err.message : String(err),
    })
    return // sem score, não envia email
  }

  try {
    await sendGhlCoachingEmail(callId)
  } catch (err) {
    console.error('[chunk-pipeline] coaching email falhou (non-fatal)', {
      callId,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}
