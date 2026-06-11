import { dbUpdateGhlCallPipeline } from "@/lib/db/calls"
import { dbMarkOrgGhlAuthError } from "@/lib/db/organizations"
import { putOriginalAudio } from "@/lib/services/call-audio-storage"
import { triggerChunking } from "@/lib/services/chunk-pipeline"
import { downloadRecording, fetchRecordingUrl, GhlAuthError } from "@/lib/services/ghl-api"
import type { GhlWebhookPayload } from "@/lib/services/ghl-helpers"
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

  // ── 2. Baixar o arquivo de áudio ───────────────────────────────────────────
  let audio
  try {
    audio = await downloadRecording(recording.url, options.accessToken)
  } catch (err) {
    if (err instanceof GhlAuthError) {
      await handleAuthExpired(callId, options.orgId, payload.contactId, err)
      return
    }
    const reason = inferFailureReason(err)
    const isTooBig = reason === "recording_too_large"
    console.error("[ghl-pipeline] downloadRecording failed", { callId, err })
    await dbUpdateGhlCallPipeline(callId, { processingStatus: "transcription_failed" })
    await notifyPipelineFailure("transcription_failed", {
      callId,
      orgId: options.orgId,
      contactId: payload.contactId,
      error: err,
      stage: "download_audio",
      reason,
      meta: {
        recordingUrl: recording.url,
        ...(isTooBig ? { sizeLimitMb: 200 } : {}),
      },
    })
    return
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
