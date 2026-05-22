import { dbUpdateGhlCallPipeline } from "@/lib/db/calls"
import { dbMarkOrgGhlAuthError } from "@/lib/db/organizations"
import { runGhlCallScoring } from "@/lib/services/ghl-call-scoring"
import { sendGhlCoachingEmail } from "@/lib/services/ghl-coaching-email"
import { downloadRecording, fetchRecordingUrl, GhlAuthError } from "@/lib/services/ghl-api"
import type { GhlWebhookPayload } from "@/lib/services/ghl-helpers"
import { notifyPipelineFailure } from "@/lib/services/pipeline-alerts"
import { transcribeAudioBuffer } from "@/lib/services/whisper"

const TRANSCRIBE_RETRY_DELAYS_MS = [0, 1500, 4000]

/**
 * Pipeline assíncrono disparado pelo webhook (via waitUntil).
 *
 * Estados terminais possíveis:
 *   - 'transcribed'           — sucesso. Outras features consomem daqui.
 *   - 'no_recording'          — não encontramos áudio no GHL para o contato.
 *   - 'transcription_failed'  — áudio existe mas Whisper falhou 3x.
 *   - 'auth_expired'          — GHL retornou 401/403; PIT da org foi rotacionado.
 *
 * NÃO faz scoring nem envia coaching email — decisão deliberada para que
 * features posteriores plugem nesse status terminal sem acoplamento.
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

  let transcript: string | null = null
  let lastError: unknown = null
  for (let attempt = 0; attempt < TRANSCRIBE_RETRY_DELAYS_MS.length; attempt++) {
    const delay = TRANSCRIBE_RETRY_DELAYS_MS[attempt]
    if (delay > 0) await sleep(delay)
    try {
      transcript = await transcribeAudioBuffer(audio.buffer, audio.mimeType, {
        trainerName: payload.userName ?? undefined,
        clientName: payload.contactName ?? undefined,
      })
      break
    } catch (err) {
      lastError = err
      console.warn("[ghl-pipeline] Whisper attempt failed", {
        callId,
        attempt: attempt + 1,
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (!transcript) {
    console.error("[ghl-pipeline] Whisper exhausted retries", { callId, lastError })
    await dbUpdateGhlCallPipeline(callId, {
      processingStatus: "transcription_failed",
    })
    await notifyPipelineFailure("transcription_failed", {
      callId,
      contactId: payload.contactId,
      error: lastError,
    })
    return
  }

  await dbUpdateGhlCallPipeline(callId, {
    transcript,
    transcriptSource: "whisper",
    processingStatus: "transcribed",
  })

  // Demo: roda scoring + coaching email inline após transcribed.
  // Best-effort — erros NÃO afetam o transcript salvo. Erro no scoring
  // pula o email (email só faz sentido se scoring rodou).
  try {
    await runGhlCallScoring(callId)
  } catch (err) {
    console.error("[ghl-pipeline] scoring failed (non-fatal)", {
      callId,
      err: err instanceof Error ? err.message : String(err),
    })
    return  // sem score, não envia email
  }

  // Email é separado num catch próprio porque é "mais best-effort" ainda
  // que scoring — mesmo se falhar, score já tá no DB e admin pode ver
  // via /calls. Idempotência via calls.email_sent garante que retentativa
  // manual depois não duplica.
  try {
    await sendGhlCoachingEmail(callId)
  } catch (err) {
    console.error("[ghl-pipeline] coaching email failed (non-fatal)", {
      callId,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
