import { dbUpdateGhlCallPipeline, dbClaimGhlMessageId, dbDeleteCall } from "@/lib/db/calls"
import { dbMarkOrgGhlAuthError } from "@/lib/db/organizations"
import { probeAudioDurationMs } from "@/lib/services/audio-chunker"
import { putOriginalAudio } from "@/lib/services/call-audio-storage"
import { triggerChunking } from "@/lib/services/chunk-pipeline"
import {
  downloadRecording,
  type DownloadedRecording,
  fetchRecordingUrl,
  GhlAuthError,
  GhlDownloadError,
} from "@/lib/services/ghl-api"
import { parseDuration, type GhlWebhookPayload } from "@/lib/services/ghl-helpers"
import { inferFailureReason, notifyPipelineFailure } from "@/lib/services/pipeline-alerts"

/**
 * Pipeline assíncrono disparado pelo webhook (via after()).
 *
 * Estados possíveis ao fim desta função:
 *   - 'queued_for_chunking'  — sucesso; chunking assumiu
 *   - 'no_recording'         — GHL não retornou áudio
 *   - 'transcription_failed' — áudio existe mas falhou ao baixar/subir/disparar chunking
 *   - 'auth_expired'         — GHL retornou 401/403; PIT rotacionado
 */
export interface ProcessGhlCallOptions {
  accessToken: string
  orgId: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry do download com espera.
//
// CAUSA RAIZ descoberta em 2026-06-11: o webhook callCompleted do GHL dispara
// IMEDIATAMENTE ao fim da call, mas a gravação ainda está sendo processada do
// lado deles — o endpoint /recording responde 422 por alguns minutos. Sem
// retry, a call era marcada transcription_failed ~1s após criada, de forma
// permanente, mesmo a gravação ficando disponível logo depois (confirmado:
// mesma URL retornou 200 + 16MB horas depois).
//
// Esperas: 60s → 120s → 180s (total ~6min + tentativa inicial). O webhook tem
// maxDuration de 800s (Fluid Compute), então cabe com folga. Erros NÃO
// transientes (auth, too large) não são retentados.
// ─────────────────────────────────────────────────────────────────────────────
const DOWNLOAD_RETRY_DELAYS_MS = [60_000, 120_000, 180_000]

async function downloadRecordingWithRetry(
  url: string,
  accessToken: string,
  callId: string,
): Promise<DownloadedRecording> {
  let lastErr: unknown
  const totalAttempts = DOWNLOAD_RETRY_DELAYS_MS.length + 1

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      return await downloadRecording(url, accessToken)
    } catch (err) {
      // Auth e erros permanentes (ex.: too large) sobem direto — retry não muda nada.
      if (err instanceof GhlAuthError) throw err
      if (err instanceof GhlDownloadError && !err.isTransient) throw err
      if (!(err instanceof GhlDownloadError)) {
        // Falha de rede ("fetch failed") também é transiente — retenta.
      }
      lastErr = err

      if (attempt < totalAttempts) {
        const waitMs = DOWNLOAD_RETRY_DELAYS_MS[attempt - 1]
        console.warn("[ghl-pipeline] download transiente falhou, aguardando retry", {
          callId,
          attempt,
          nextWaitSeconds: waitMs / 1000,
          err: err instanceof Error ? err.message : String(err),
        })
        await new Promise((r) => setTimeout(r, waitMs))
      }
    }
  }

  throw lastErr
}

async function handleAuthExpired(
  callId: string,
  orgId: string,
  contactId: string,
  err: GhlAuthError,
): Promise<void> {
  console.warn("[ghl-pipeline] GHL auth expired", { callId, orgId, status: err.status, msg: err.message })
  await dbUpdateGhlCallPipeline(callId, { processingStatus: "auth_expired" })
  await dbMarkOrgGhlAuthError(orgId)
  await notifyPipelineFailure("auth_expired", {
    callId,
    orgId,
    contactId,
    error: err,
    stage: "fetch_recording",
    reason: "ghl_auth_expired",
    meta: { httpStatus: err.status },
  })
}

export async function processGhlCall(
  callId: string,
  payload: GhlWebhookPayload,
  options: ProcessGhlCallOptions,
): Promise<void> {
  await dbUpdateGhlCallPipeline(callId, { processingStatus: "processing" })

  // ── 1. Buscar URL da gravação no GHL ───────────────────────────────────────
  let recording
  try {
    recording = await fetchRecordingUrl(payload.contactId, options.accessToken)
  } catch (err) {
    if (err instanceof GhlAuthError) {
      await handleAuthExpired(callId, options.orgId, payload.contactId, err)
      return
    }
    const reason = inferFailureReason(err)
    console.error("[ghl-pipeline] fetchRecordingUrl failed", { callId, err })
    await dbUpdateGhlCallPipeline(callId, { processingStatus: "no_recording" })
    await notifyPipelineFailure("no_recording", {
      callId,
      orgId: options.orgId,
      contactId: payload.contactId,
      error: err,
      stage: "fetch_recording",
      reason,
    })
    return
  }

  if (!recording) {
    console.warn("[ghl-pipeline] no recording found for contact", {
      callId,
      contactId: payload.contactId,
    })
    await dbUpdateGhlCallPipeline(callId, { processingStatus: "no_recording" })
    await notifyPipelineFailure("no_recording", {
      callId,
      orgId: options.orgId,
      contactId: payload.contactId,
      stage: "fetch_recording",
      reason: "recording_not_found",
    })
    return
  }

  await dbUpdateGhlCallPipeline(callId, { recordingUrl: recording.url })

  // ── 1b. Dedup pela identidade real da gravação (messageId do GHL) ──────────
  // O external_call_id inclui a duração no hash, então o GHL reentregar a mesma
  // call com a duração preenchida depois gera uma 2ª linha. O messageId é igual
  // nas duas entregas: quem reivindicar primeiro vence; a duplicata é apagada
  // AQUI, antes do download e do Whisper (zero custo extra de LLM). messageId
  // vazio (não deveria ocorrer) → não trava, segue como antes.
  if (recording.messageId) {
    const claimed = await dbClaimGhlMessageId(callId, recording.messageId)
    if (!claimed) {
      console.info("[ghl-pipeline] duplicate recording (messageId já reivindicado) — descartando", {
        callId,
        orgId: options.orgId,
        messageId: recording.messageId,
      })
      await dbDeleteCall(callId)
      return
    }
  }

  // ── 2. Baixar o arquivo de áudio (com retry — GHL processa o áudio async) ──
  let audio
  try {
    audio = await downloadRecordingWithRetry(recording.url, options.accessToken, callId)
  } catch (err) {
    if (err instanceof GhlAuthError) {
      await handleAuthExpired(callId, options.orgId, payload.contactId, err)
      return
    }
    console.error("[ghl-pipeline] downloadRecording failed (após retries)", { callId, err })

    // 422/404 transiente mesmo após ~6min de retries: a gravação ainda não está
    // pronta no GHL. Status 'no_recording' (não 'transcription_failed') — é
    // semanticamente correto e a dica orienta re-processar em alguns minutos.
    const isStillProcessing = err instanceof GhlDownloadError && err.isTransient
    const status = isStillProcessing ? "no_recording" : "transcription_failed"
    const reason = isStillProcessing ? "recording_not_ready" : inferFailureReason(err)

    await dbUpdateGhlCallPipeline(callId, { processingStatus: status })
    await notifyPipelineFailure(status, {
      callId,
      orgId: options.orgId,
      contactId: payload.contactId,
      error: err,
      stage: "download_audio",
      reason,
      meta: {
        recordingUrl: recording.url,
        attempts: DOWNLOAD_RETRY_DELAYS_MS.length + 1,
        totalWaitMin: (DOWNLOAD_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) / 60_000).toFixed(0),
        ...(err instanceof GhlDownloadError ? { httpStatus: err.status } : {}),
        ...(reason === "recording_too_large" ? { sizeLimitMb: 200 } : {}),
      },
    })
    return
  }

  // ── 2b. Backfill de duração: só quando o GHL não a informou ────────────────
  // O webhook já barrou as < 30s; aqui a duração do GHL é >= 30s ou nula. Não
  // mexemos numa duração que o GHL mandou. Nula distorceria o billing, então
  // medimos o arquivo real e gravamos.
  if (parseDuration(payload.duration) == null) {
    // Medição é best-effort: se o ffmpeg falhar, segue a análise sem duração.
    const measuredSeconds = await probeAudioDurationMs(audio.buffer)
      .then((ms) => Math.round(ms / 1000))
      .catch((err) => {
        console.warn("[ghl-pipeline] não foi possível medir a duração; análise segue sem ela", {
          callId,
          err: err instanceof Error ? err.message : String(err),
        })
        return 0
      })
    // 0 = header ilegível OU áudio < 1s: não gravamos (seria duração falsa). A
    // persistência fica FORA do best-effort de propósito — se a gravação falhar,
    // o erro sobe (vira webhook_failed, retentável) em vez de sub-faturar a call.
    if (measuredSeconds > 0) {
      await dbUpdateGhlCallPipeline(callId, { durationSeconds: measuredSeconds })
    }
  }

  // ── 3. Subir para Storage e disparar chunking ──────────────────────────────
  try {
    await putOriginalAudio(callId, audio.buffer, audio.mimeType)
  } catch (err) {
    console.error("[ghl-pipeline] putOriginalAudio failed", { callId, err })
    await dbUpdateGhlCallPipeline(callId, { processingStatus: "transcription_failed" })
    await notifyPipelineFailure("transcription_failed", {
      callId,
      orgId: options.orgId,
      contactId: payload.contactId,
      error: err,
      stage: "storage_upload",
      reason: inferFailureReason(err),
      meta: { mimeType: audio.mimeType, sizeBytes: audio.buffer.byteLength },
    })
    return
  }

  await dbUpdateGhlCallPipeline(callId, { processingStatus: "queued_for_chunking" })

  try {
    // Aguarda o disparo: processGhlCall roda dentro do after() do webhook, então
    // o await mantém a função viva até o request de chunking sair.
    await triggerChunking(callId)
  } catch (err) {
    console.error("[ghl-pipeline] triggerChunking failed", { callId, err })
    await dbUpdateGhlCallPipeline(callId, { processingStatus: "transcription_failed" })
    await notifyPipelineFailure("transcription_failed", {
      callId,
      orgId: options.orgId,
      contactId: payload.contactId,
      error: err,
      stage: "trigger_chunking",
      reason: inferFailureReason(err),
      meta: { note: "Áudio já está no Storage. Retentar via /api/calls/chunk com o callId." },
    })
  }
}
