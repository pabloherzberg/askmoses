import { dbUpdateGhlCallPipeline } from "@/lib/db/calls"
import { dbMarkOrgGhlAuthError } from "@/lib/db/organizations"
import { putOriginalAudio } from "@/lib/services/call-audio-storage"
import { triggerChunking } from "@/lib/services/chunk-pipeline"
import { downloadRecording, fetchRecordingUrl, GhlAuthError } from "@/lib/services/ghl-api"
import type { GhlWebhookPayload } from "@/lib/services/ghl-helpers"
import { notifyPipelineFailure } from "@/lib/services/pipeline-alerts"

/**
 * Pipeline assíncrono disparado pelo webhook (via after()).
 *
 * Desde a migração pra transcrição por chunks (077-080), este pipeline NÃO
 * transcreve mais inline — o recording (que pode passar de 25MB e estourar o
 * Whisper) é subido pro Storage e entregue à fila de chunking. A transcrição,
 * scoring e coaching email rodam depois, no worker auto-drenante
 * (finalizeCallIfReady), igual ao fluxo de upload manual.
 *
 * Estados possíveis ao fim desta função:
 *   - 'queued_for_chunking'   — sucesso. O chunking foi disparado; daqui o
 *                               pipeline de chunks assume (→ awaiting_chunks →
 *                               transcribed → scoring/email).
 *   - 'no_recording'          — não encontramos áudio no GHL para o contato.
 *   - 'transcription_failed'  — áudio existe mas falhou ao baixar/subir.
 *   - 'auth_expired'          — GHL retornou 401/403; PIT da org foi rotacionado.
 */
export interface ProcessGhlCallOptions {
  accessToken: string
  orgId: string
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
  await notifyPipelineFailure("auth_expired", { callId, orgId, contactId, error: err })
}

export async function processGhlCall(
  callId: string,
  payload: GhlWebhookPayload,
  options: ProcessGhlCallOptions,
): Promise<void> {
  await dbUpdateGhlCallPipeline(callId, { processingStatus: "processing" })

  let recording
  try {
    recording = await fetchRecordingUrl(payload.contactId, options.accessToken)
  } catch (err) {
    if (err instanceof GhlAuthError) {
      await handleAuthExpired(callId, options.orgId, payload.contactId, err)
      return
    }
    console.error("[ghl-pipeline] fetchRecordingUrl failed", { callId, err })
    await dbUpdateGhlCallPipeline(callId, {
      processingStatus: "no_recording",
    })
    await notifyPipelineFailure("no_recording", {
      callId,
      contactId: payload.contactId,
      error: err,
    })
    return
  }

  if (!recording) {
    console.warn("[ghl-pipeline] no recording found for contact", {
      callId,
      contactId: payload.contactId,
    })
    await dbUpdateGhlCallPipeline(callId, {
      processingStatus: "no_recording",
    })
    await notifyPipelineFailure("no_recording", {
      callId,
      orgId: options.orgId,
      contactId: payload.contactId,
    })
    return
  }

  await dbUpdateGhlCallPipeline(callId, { recordingUrl: recording.url })

  let audio
  try {
    audio = await downloadRecording(recording.url, options.accessToken)
  } catch (err) {
    if (err instanceof GhlAuthError) {
      await handleAuthExpired(callId, options.orgId, payload.contactId, err)
      return
    }
    console.error("[ghl-pipeline] downloadRecording failed", { callId, err })
    await dbUpdateGhlCallPipeline(callId, {
      processingStatus: "transcription_failed",
    })
    await notifyPipelineFailure("transcription_failed", {
      callId,
      contactId: payload.contactId,
      error: err,
    })
    return
  }

  // Entrega à fila de chunking: sobe o recording (transitório) e dispara a rota
  // de corte. A partir daqui o pipeline de chunks assume — transcrição, scoring
  // e email rodam na consolidação (finalizeCallIfReady).
  try {
    await putOriginalAudio(callId, audio.buffer, audio.mimeType)
    await dbUpdateGhlCallPipeline(callId, { processingStatus: "queued_for_chunking" })
    triggerChunking(callId)
  } catch (err) {
    console.error("[ghl-pipeline] enqueue chunking failed", { callId, err })
    await dbUpdateGhlCallPipeline(callId, {
      processingStatus: "transcription_failed",
    })
    await notifyPipelineFailure("transcription_failed", {
      callId,
      contactId: payload.contactId,
      error: err,
    })
  }
}
