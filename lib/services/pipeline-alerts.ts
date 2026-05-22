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

interface StatusDisplay {
  emoji: string
  title: string
  hint: string
  color: string
}

// Mapeia cada status terminal pra uma face humana: cor lateral, emoji,
// título amigável e dica de ação. Mantém o destinatário focado em "o que
// fazer" em vez de só "o que aconteceu".
const STATUS_DISPLAY: Record<PipelineFailureStatus, StatusDisplay> = {
  no_recording: {
    emoji: "📞",
    title: "Gravação não encontrada",
    hint: "GHL ainda não retornou áudio dessa call. Pode ser delay de processamento — retentar manualmente após alguns minutos.",
    color: "#ECB22E", // amber
  },
  transcription_failed: {
    emoji: "🎙️",
    title: "Transcrição falhou",
    hint: "Whisper retornou erro após 3 tentativas. Verificar OPENAI_API_KEY na Vercel e tamanho do áudio (cap 200MB).",
    color: "#E01E5A", // red
  },
  webhook_failed: {
    emoji: "🚨",
    title: "Pipeline crashou inesperadamente",
    hint: "Erro não previsto. Ver Vercel logs com prefixo [ghl-webhook] ou [ghl-pipeline] pra stack trace.",
    color: "#E01E5A", // red
  },
  auth_expired: {
    emoji: "🔐",
    title: "Token GHL expirado",
    hint: "O PIT da org foi rotacionado/revogado no Pepper. Abrir /admin/organizations/<id>/integrations/ghl e colar token novo.",
    color: "#7F1D1D", // dark red — needs human action
  },
}

/**
 * Best-effort alert pra falhas terminais do pipeline GHL. Se a env
 * PIPELINE_ALERT_WEBHOOK_URL não está setada, vira no-op. Se o POST falha,
 * loga mas não propaga — o pipeline nunca deve quebrar por causa do alerta.
 *
 * Formato Block Kit do Slack: header com emoji + título, fields organizados,
 * dica de ação, e barra colorida lateral por severidade. O `text` no nível
 * raiz é fallback pra clientes que não renderizam blocks (e pra notificação
 * push do Slack mobile).
 */
export async function notifyPipelineFailure(
  status: PipelineFailureStatus,
  context: PipelineFailureContext,
): Promise<void> {
  const url = process.env.PIPELINE_ALERT_WEBHOOK_URL
  if (!url) return

  const display = STATUS_DISPLAY[status]

  const errorText = context.error
    ? context.error instanceof Error
      ? context.error.message
      : String(context.error)
    : null

  const fallbackText = `${display.emoji} ${display.title} — ${status} (callId: ${context.callId})`

  const fields: Array<{ type: "mrkdwn"; text: string }> = [
    { type: "mrkdwn", text: `📞 *Call ID*\n\`${context.callId}\`` },
    { type: "mrkdwn", text: `🏢 *Org ID*\n\`${context.orgId ?? "—"}\`` },
  ]
  if (context.contactId) {
    fields.push({ type: "mrkdwn", text: `👤 *Contact ID*\n\`${context.contactId}\`` })
  }
  fields.push({
    type: "mrkdwn",
    text: `⚙️ *Status*\n\`${status}\``,
  })

  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: { type: "plain_text", text: `${display.emoji} ${display.title}`, emoji: true },
    },
    {
      type: "section",
      fields,
    },
  ]

  if (errorText) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Erro:*\n\`\`\`${truncate(errorText, 500)}\`\`\``,
      },
    })
  }

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `_${display.hint}_` },
  })

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `AskMoses Pipeline Alerts • <!date^${Math.floor(Date.now() / 1000)}^{date_short} {time}|now>`,
      },
    ],
  })

  const payload = {
    text: fallbackText,
    attachments: [
      {
        color: display.color,
        blocks,
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

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + "…"
}
