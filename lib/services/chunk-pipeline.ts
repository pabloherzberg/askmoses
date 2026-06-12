import {
  dbClaimCallForConsolidation,
  dbClearChunkPayloads,
  dbCreateChunks,
  dbFailPendingChunksForCall,
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
  deleteOriginalAudio,
  getChunkAudio,
  getOriginalAudio,
  putChunkAudio,
} from '@/lib/services/call-audio-storage'
import { runGhlCallScoring } from '@/lib/services/ghl-call-scoring'
import { sendGhlCoachingEmail } from '@/lib/services/ghl-coaching-email'
import { inferFailureReason, notifyPipelineFailure } from '@/lib/services/pipeline-alerts'
import { stitchChunkTranscripts } from '@/lib/services/transcript-stitcher'
import { diarizeTranscript } from '@/lib/services/whisper'
import { transcribeAudioBuffer } from '@/lib/services/whisper'
import { selfBaseUrl } from '@/lib/internal-url'

function truncateStr(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + "…"
}

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
 * Dispara o worker da fila. A fila é auto-drenante por eventos, SEM cron
 * próprio: o ingest chama isto após enfileirar, e o próprio worker chama de novo
 * enquanto sobra trabalho. O cron existente (recover-stale-analyses, 15min)
 * também chama como rede de segurança caso um elo da cadeia morra. Idempotente —
 * chamadas concorrentes só competem pelo claim atômico (SKIP LOCKED), nunca
 * duplicam transcrição.
 *
 * É `async` e o caller DEVE aguardar (dentro de after()/waitUntil quando vier de
 * um route handler): em serverless o fetch não-aguardado é morto quando a função
 * retorna, e o disparo se perde silenciosamente. O worker responde 202 na hora,
 * então o await é barato.
 */
export async function kickChunkWorker(): Promise<void> {
  const secret = process.env.INTERNAL_API_SECRET
  if (!secret) {
    console.error('[chunk-pipeline] MISCONFIG: INTERNAL_API_SECRET ausente — worker não disparado')
    // Alerta crítico de misconfig: sem isso, nenhuma call será transcrita
    await notifyPipelineFailure("transcription_failed", {
      callId: "N/A",
      stage: "misconfig",
      reason: "missing_internal_api_secret",
    })
    return
  }
  const workerUrl = `${selfBaseUrl()}/api/calls/process-chunks`
  try {
    const res = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'x-internal-secret': secret },
    })
    if (!res.ok) {
      console.error('[chunk-pipeline] kickChunkWorker: worker retornou non-ok', { status: res.status, url: workerUrl })
    }
  } catch (err) {
    console.error('[chunk-pipeline] kickChunkWorker falhou:', { err, url: workerUrl })
  }
}

/** Whisper-1: US$0.006 por minuto de áudio. */
const WHISPER_USD_PER_MINUTE = 0.006

/** Teto de tentativas por chunk antes de aposentar em 'failed'. */
export const MAX_CHUNK_ATTEMPTS = 3

/**
 * Teto maior pra falhas de throttling (429 rate limit / quota esgotada):
 * não são defeito do chunk — a mesma transcrição funciona minutos depois.
 * Com os delays abaixo, 8 tentativas cobrem ~1h de rate limit contínuo
 * (e ~4h de quota esgotada) antes de desistir.
 */
export const MAX_CHUNK_ATTEMPTS_THROTTLED = 8

/** Delay de re-fila por tentativa quando o Whisper devolveu 429 de rate limit.
 *  Escada 1min → 5min → 15min (última repete). O claim (083) só re-reivindica
 *  o chunk após o delay — sem isso o worker auto-drenante re-pega em segundos,
 *  dentro da mesma janela de rate limit, e queima as tentativas à toa. */
const RATE_LIMIT_REQUEUE_DELAYS_S = [60, 300, 900]

/** Quota esgotada: re-tenta a cada 30min — espera créditos serem adicionados. */
const QUOTA_REQUEUE_DELAY_S = 1_800

// Dedup do alerta de quota esgotada: a quota é da CONTA OpenAI, não da call —
// num esgotamento, TODO chunk de TODA call falharia e dispararia o mesmo
// alerta (com 100 usuários, dezenas de mensagens idênticas no Slack). Um
// alerta por instância warm a cada 30min é suficiente pra acionar a recarga;
// cold starts podem repetir, mas cortam ~95% do ruído.
const QUOTA_ALERT_DEDUP_MS = 30 * 60_000
let lastQuotaAlertAtMs = 0

function whisperChunkCost(chunk: DbCallChunk): number {
  if (chunk.start_ms == null || chunk.end_ms == null) return 0
  const minutes = (chunk.end_ms - chunk.start_ms) / 60_000
  return Number((minutes * WHISPER_USD_PER_MINUTE).toFixed(6))
}

/**
 * Dispara a rota de chunking. Usada pelo ingest (manual e GHL) após subir o
 * áudio original pro Storage: a rota /api/calls/chunk corta o ffmpeg e enfileira
 * os chunks (ela mesma responde 202 e processa em after()).
 *
 * É `async` e o caller DEVE aguardar dentro de after()/waitUntil. Antes era um
 * `void fetch` fire-and-forget: em serverless ele era morto quando a função do
 * caller retornava, deixando a call presa em 'queued_for_chunking' de forma
 * INTERMITENTE (passava ou não conforme cold start/timing). Aguardar dentro de
 * after() garante que o request saia antes de a função ser congelada.
 */
export async function triggerChunking(callId: string): Promise<void> {
  const secret = process.env.INTERNAL_API_SECRET
  if (!secret) {
    console.error('[chunk-pipeline] MISCONFIG: INTERNAL_API_SECRET ausente — chunking não disparado', { callId })
    throw new Error("INTERNAL_API_SECRET não configurado — chunking não pode ser disparado")
  }
  const chunkUrl = `${selfBaseUrl()}/api/calls/chunk`
  const res = await fetch(chunkUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify({ callId }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`/api/calls/chunk retornou HTTP ${res.status}: ${truncateStr(body, 300)}`)
  }
}

/**
 * Orquestra o chunking de uma call já com o áudio original no Storage: baixa,
 * corta + enfileira, apaga o original e cutuca o worker pra começar a drenar.
 * Chamada pela rota /api/calls/chunk. O áudio original é apagado SEMPRE (mesmo
 * em erro do chunking, o finally limpa) — ele é puramente transitório.
 */
export async function runChunkingForCall(callId: string): Promise<void> {
  const call = await dbGetCallById(callId)
  if (!call) throw new Error(`runChunkingForCall: call ${callId} não encontrada`)

  try {
    const audio = await getOriginalAudio(callId)
    await chunkAndEnqueueCall({ callId, orgId: call.org_id, audio })
    await kickChunkWorker()
  } finally {
    await deleteOriginalAudio(callId)
  }
}

export interface ChunkAndEnqueueInput {
  callId: string
  orgId: string | null
  audio: Buffer
  options?: ChunkOptions
}

/**
 * Corta o áudio em chunks sobrepostos, sobe cada um no Storage e enfileira.
 * Move a call: 'chunking' → 'awaiting_chunks'. Em erro, marca
 * 'transcription_failed' e alerta. O áudio original NÃO é persistido — vive só
 * no buffer recebido e é descartado pelo caller.
 */
export async function chunkAndEnqueueCall(input: ChunkAndEnqueueInput): Promise<void> {
  const { callId, orgId, audio } = input
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
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[chunk-pipeline] chunkAndEnqueueCall falhou', { callId, err: msg })
    await dbUpdateGhlCallPipeline(callId, { processingStatus: 'transcription_failed' })
    await notifyPipelineFailure('transcription_failed', {
      callId,
      orgId: orgId ?? undefined,
      error: err,
      stage: 'chunking',
      reason: inferFailureReason(err),
    })
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
    const reason = inferFailureReason(err)

    // Throttling (429 rate limit / quota) ganha teto maior e re-fila COM delay:
    // a falha é do momento, não do chunk. Erros "reais" mantêm o retry imediato
    // e o teto curto de sempre.
    const isRateLimit = reason === 'whisper_rate_limit'
    const isQuota = reason === 'whisper_quota_exhausted'
    const maxAttempts = isRateLimit || isQuota ? MAX_CHUNK_ATTEMPTS_THROTTLED : MAX_CHUNK_ATTEMPTS
    const delaySeconds = isQuota
      ? QUOTA_REQUEUE_DELAY_S
      : isRateLimit
        ? RATE_LIMIT_REQUEUE_DELAYS_S[
            Math.min(Math.max(chunk.attempts - 1, 0), RATE_LIMIT_REQUEUE_DELAYS_S.length - 1)
          ]
        : 0

    const result = await dbRetryOrFailChunk(chunk, msg, maxAttempts, delaySeconds)

    console.warn('[chunk-pipeline] transcribeChunk falhou', {
      chunkId: chunk.id,
      callId: chunk.call_id,
      // attempts já vem incrementado do claim — este É o número da tentativa.
      attempt: chunk.attempts,
      next: result,
      delaySeconds,
      reason,
      err: msg,
    })

    // Quota esgotada exige ação humana (recarga no billing) — alerta na hora,
    // não só quando o chunk aposenta horas depois. Dedup global (ver constante).
    if (isQuota && Date.now() - lastQuotaAlertAtMs > QUOTA_ALERT_DEDUP_MS) {
      lastQuotaAlertAtMs = Date.now()
      await notifyPipelineFailure('transcription_failed', {
        callId: chunk.call_id,
        error: err,
        stage: 'transcription',
        reason,
        meta: {
          chunkIndex: chunk.chunk_index,
          chunkId: chunk.id,
          note: `Quota é da conta — TODAS as calls estão paradas. A fila re-tenta a cada ${QUOTA_REQUEUE_DELAY_S / 60}min e transcreve sozinha após a recarga.`,
        },
      })
    }

    // Alerta Slack quando o chunk é aposentado (failed) — aqui está a causa real
    // do "Whisper retornou erro após N tentativas". Antes só havia log de console.
    if (result === 'failed') {
      const durationMin = chunk.start_ms != null && chunk.end_ms != null
        ? ((chunk.end_ms - chunk.start_ms) / 60_000).toFixed(1)
        : null

      await notifyPipelineFailure('transcription_failed', {
        callId: chunk.call_id,
        error: err,
        stage: 'transcription',
        reason,
        meta: {
          chunkIndex: chunk.chunk_index,
          chunkId: chunk.id,
          attempts: chunk.attempts,
          mimeType: chunk.mime_type,
          storagePath: chunk.storage_path ?? "—",
          ...(durationMin ? { durationMin } : {}),
        },
      })
    }
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
    // Re-entrância: cada chunk remanescente que termina re-chama finalize pra
    // esta call; sem o guard, a call já falhada seria re-marcada e re-alertada
    // a cada vez.
    const call = await dbGetCallById(callId)
    if (call?.processing_status === 'transcription_failed') return

    await dbUpdateGhlCallPipeline(callId, { processingStatus: 'transcription_failed' })
    // Aposenta os 'pending' restantes ANTES de deletar o áudio: sem isso eles
    // continuariam sendo reivindicados, falhariam no download (arquivo já
    // removido) e queimariam todas as tentativas — invocações e alertas à toa
    // numa call já morta. Chunks 'processing' em voo terminam sós (inócuo).
    await dbFailPendingChunksForCall(callId, 'call aposentada: outro chunk falhou definitivamente').catch(() => {})
    await deleteAllChunkAudioForCall(callId)
    // Nota: cada chunk que chegou a 'failed' já gerou alerta individual em transcribeChunk()
    // com a causa exata. Este alerta é o resumo consolidado — indica quantos chunks falharam.
    await notifyPipelineFailure('transcription_failed', {
      callId,
      stage: 'transcription',
      reason: 'unknown',
      error: new Error(`${counts.failed}/${counts.total} chunk(s) falharam após esgotar as tentativas (${MAX_CHUNK_ATTEMPTS} normais / ${MAX_CHUNK_ATTEMPTS_THROTTLED} com rate limit)`),
      meta: {
        totalChunks: counts.total,
        failedChunks: counts.failed,
        doneChunks: counts.done,
        note: "Ver alertas individuais por chunk acima para a causa exata de cada falha.",
      },
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
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[chunk-pipeline] consolidação falhou', { callId, err: msg })
    await dbUpdateGhlCallPipeline(callId, { processingStatus: 'transcription_failed' })
    await notifyPipelineFailure('transcription_failed', {
      callId,
      error: err,
      stage: 'consolidation',
      reason: inferFailureReason(err),
    })
    return
  }

  // Fanout pós-transcribed: scoring + coaching email. Best-effort — erros não
  // afetam o transcript já salvo, MAS são alertados: uma call transcrita sem
  // score aparece "salva mas não analisada" no dashboard, e sem alerta esse
  // estado é invisível (ninguém sabe que a análise falhou).
  try {
    await runGhlCallScoring(callId)
  } catch (err) {
    console.error('[chunk-pipeline] scoring falhou (non-fatal)', {
      callId,
      err: err instanceof Error ? err.message : String(err),
    })
    await notifyPipelineFailure('scoring_failed', {
      callId,
      error: err,
      stage: 'consolidation',
      reason: 'scoring_error',
      meta: { note: 'Transcript está salvo. Re-rodar análise via admin ou re-disparar runGhlCallScoring.' },
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
    await notifyPipelineFailure('email_failed', {
      callId,
      error: err,
      stage: 'consolidation',
      reason: 'email_error',
      meta: { note: 'Call já tem transcript + score. Só o email falhou — reenviar manualmente se necessário.' },
    })
  }
}
