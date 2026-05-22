export type PipelineFailureStatus =
  | "no_recording"
  | "transcription_failed"
  | "webhook_failed"
  | "auth_expired"

export interface PipelineFailureContext {
  callId: string
  orgId?: string
  contactId?: string | null
  error?: unknown
}

/**
 * Best-effort alert pra falhas terminais do pipeline GHL. Se a env
 * PIPELINE_ALERT_WEBHOOK_URL não está setada, vira no-op. Se o POST falha,
 * loga mas não propaga — o pipeline nunca deve quebrar por causa do alerta.
 *
 * Formato compatível com Slack Incoming Webhooks (também aceitável por
 * Mattermost / Discord / endpoints genéricos).
 */
export async function notifyPipelineFailure(
  status: PipelineFailureStatus,
  context: PipelineFailureContext,
): Promise<void> {
  const url = process.env.PIPELINE_ALERT_WEBHOOK_URL
  if (!url) return

  const errorText = context.error
    ? context.error instanceof Error
      ? context.error.message
      : String(context.error)
    : "—"

  const payload = {
    text: `[ghl-pipeline] ${status}`,
    attachments: [
      {
        fields: [
          { title: "callId", value: context.callId, short: true },
          { title: "orgId", value: context.orgId ?? "?", short: true },
          { title: "contactId", value: context.contactId ?? "?", short: true },
          { title: "error", value: errorText, short: false },
        ],
      },
    ],
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.error("[pipeline-alerts] webhook returned non-ok", {
        httpStatus: res.status,
        status,
        callId: context.callId,
      })
    }
  } catch (err) {
    console.error("[pipeline-alerts] failed to post", {
      err,
      status,
      callId: context.callId,
    })
  }
}
