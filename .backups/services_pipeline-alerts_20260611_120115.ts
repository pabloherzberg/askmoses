// ─────────────────────────────────────────────────────────────────────────────
// Status de falha terminal + sub-tipos granulares para diagnóstico no Slack.
//
// PipelineFailureStatus  → status salvo no banco (processing_status)
// PipelineFailureStage   → em qual etapa do pipeline a falha ocorreu
// PipelineFailureReason  → causa específica — substitui a mensagem genérica
// ─────────────────────────────────────────────────────────────────────────────

export type PipelineFailureStatus =
  | "no_recording"
  | "transcription_failed"
  | "webhook_failed"
  | "auth_expired"

/** Etapa onde o erro foi detectado — aparece no campo Stage do Slack. */
export type PipelineFailureStage =
  | "webhook"          // handler do webhook GHL
  | "fetch_recording"  // fetchRecordingUrl()
  | "download_audio"   // downloadRecording()
  | "storage_upload"   // putOriginalAudio() / putChunkAudio()
  | "trigger_chunking" // triggerChunking() — disparo da rota /api/calls/chunk
  | "chunking"         // chunkAudio() / ffmpeg
  | "transcription"    // Whisper API
  | "consolidation"    // stitchChunkTranscripts() / diarizeTranscript()
  | "misconfig"        // variável de ambiente ausente / URL interna inválida

/**
 * Causa específica do erro. Permite dicas de ação exatas e elimina a mensagem
 * genérica "verificar OPENAI_API_KEY e tamanho do áudio" para todos os casos.
 */
export type PipelineFailureReason =
  // ── Configuração ──────────────────────────────────────────────────────────
  | "missing_openai_api_key"       // OPENAI_API_KEY não configurada na Vercel
  | "missing_internal_api_secret"  // INTERNAL_API_SECRET ausente — chunking não dispara
  | "missing_app_url"              // VERCEL_URL / NEXT_PUBLIC_APP_URL não definidos
  // ── GHL / Autenticação ────────────────────────────────────────────────────
  | "ghl_auth_expired"             // PIT rotacionado/revogado — 401/403 da GHL API
  | "ghl_api_error"                // Erro HTTP da GHL API (4xx/5xx inesperado)
  | "recording_not_found"          // GHL não retornou recording URL p/ esse contato
  | "recording_url_expired"        // URL de recording retornou 404/410 ao baixar
  | "recording_too_large"          // Arquivo > 200 MB — Whisper não aceita
  // ── Whisper / Transcrição ─────────────────────────────────────────────────
  | "whisper_timeout"              // Whisper não respondeu em 120s (3 tentativas)
  | "whisper_http_4xx"             // Erro 4xx da API Whisper (request inválido)
  | "whisper_http_5xx"             // Erro 5xx da API Whisper (OpenAI instável)
  | "whisper_rate_limit"           // 429 — rate limit OpenAI esgotado
  | "whisper_invalid_format"       // Extensão/formato de áudio rejeitado pelo Whisper
  | "whisper_empty_response"       // Whisper retornou body vazio ou text: ""
  // ── ffmpeg / Chunking ─────────────────────────────────────────────────────
  | "ffmpeg_not_found"             // ffmpeg-static não encontrado no bundle
  | "ffmpeg_error"                 // ffmpeg saiu com código não-zero
  | "chunk_exceeds_max"            // Áudio > 72 chunks (~12h) — limite de segurança
  | "chunk_storage_failed"         // Supabase Storage indisponível para chunks
  // ── Banco / Infraestrutura ────────────────────────────────────────────────
  | "db_error"                     // Falha em operação no banco Supabase
  | "supabase_storage_error"       // Supabase Storage indisponível (geral)
  | "internal_fetch_failed"        // Fetch interno falhou (rede, timeout, URL errada)
  // ── Fallback ──────────────────────────────────────────────────────────────
  | "unknown"                      // Erro não classificado — ver stack trace

export interface PipelineFailureContext {
  callId: string
  orgId?: string
  contactId?: string | null
  error?: unknown
  /** Etapa onde o erro ocorreu — enriquece o campo Stage no Slack. */
  stage?: PipelineFailureStage
  /** Causa específica — substitui/complementa a dica genérica. */
  reason?: PipelineFailureReason
  /** Dados extras de diagnóstico (HTTP status, URL, tamanho do arquivo, etc.). */
  meta?: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookup tables — emoji/cor/título/dica por status E por reason
// ─────────────────────────────────────────────────────────────────────────────

interface StatusDisplay {
  emoji: string
  title: string
  hint: string
  color: string
}

const STATUS_DISPLAY: Record<PipelineFailureStatus, StatusDisplay> = {
  no_recording: {
    emoji: "📞",
    title: "Gravação não encontrada",
    hint: "GHL ainda não retornou áudio para essa call. Retentar manualmente após alguns minutos.",
    color: "#ECB22E",
  },
  transcription_failed: {
    emoji: "🎙️",
    title: "Transcrição falhou",
    hint: "Ver campo *Causa* abaixo para diagnóstico exato.",
    color: "#E01E5A",
  },
  webhook_failed: {
    emoji: "🚨",
    title: "Pipeline crashou inesperadamente",
    hint: "Erro não previsto. Ver Vercel logs com prefixo [ghl-webhook] ou [ghl-pipeline].",
    color: "#E01E5A",
  },
  auth_expired: {
    emoji: "🔐",
    title: "Token GHL expirado",
    hint: "O PIT da org foi rotacionado/revogado. Abrir /admin/organizations/<id>/integrations/ghl e colar token novo.",
    color: "#7F1D1D",
  },
}

/** Dica de ação específica por causa — substitui a dica genérica do status. */
const REASON_HINT: Partial<Record<PipelineFailureReason, string>> = {
  missing_openai_api_key:
    "⚠️ *OPENAI_API_KEY* não está configurada na Vercel. Ir em Settings → Environment Variables e adicionar a chave. Todas as calls falharão até corrigir.",
  missing_internal_api_secret:
    "⚠️ *INTERNAL_API_SECRET* ausente na Vercel. Sem ele, a rota /api/calls/chunk retorna 401 e nenhum áudio é transcrito. Adicionar nas env vars e fazer redeploy.",
  missing_app_url:
    "⚠️ Nenhuma URL de base encontrada (VERCEL_URL / NEXT_PUBLIC_APP_URL). As chamadas internas entre rotas falham. Checar variáveis de ambiente no projeto Vercel.",
  ghl_auth_expired:
    "O PIT (Private Integration Token) da org foi rotacionado ou revogado no GoHighLevel. Abrir /admin/organizations/<id>/integrations/ghl e colar o novo token.",
  ghl_api_error:
    "A API do GHL retornou erro inesperado. Ver campo *Erro* para HTTP status e body. Pode ser instabilidade temporária — retentar. Se persistir, checar status.gohighlevel.com.",
  recording_not_found:
    "GHL não tem recording associado a esse contato ainda. Delay de processamento GHL. Retentar via /admin após 5-10 min. Se persistir, a call pode não ter sido gravada.",
  recording_url_expired:
    "URL de recording retornou 404/410 — GHL expirou ou removeu o arquivo. A call precisa ser re-processada manualmente a partir de um novo webhook.",
  recording_too_large:
    "Arquivo de áudio maior que 200 MB. Verificar duração da call. Para calls muito longas (>4h), considerar aumentar o limite ou pré-comprimir no GHL.",
  whisper_timeout:
    "Whisper não respondeu em 120s em 3 tentativas consecutivas. Pode ser instabilidade OpenAI ou chunk muito grande. Verificar status.openai.com. A call pode ser re-tentada.",
  whisper_http_4xx:
    "Whisper rejeitou o request (4xx). Ver campo *Erro* para o código exato. Causas comuns: formato de arquivo inválido, prompt muito longo, arquivo corrompido durante chunking.",
  whisper_http_5xx:
    "OpenAI retornou 5xx em todas as 3 tentativas. Ver status.openai.com. Re-tentar após estabilização.",
  whisper_rate_limit:
    "Rate limit OpenAI atingido (429). Muitas calls sendo processadas simultaneamente. Considerar reduzir CHUNK_BATCH ou adicionar delay entre chunks. Temporário — re-tentar.",
  whisper_invalid_format:
    "Formato/extensão de áudio rejeitado pelo Whisper. Formatos aceitos: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm. Verificar o MIME type que o GHL está retornando.",
  whisper_empty_response:
    "Whisper retornou resposta vazia. O áudio pode estar silencioso ou corrompido. Baixar o arquivo original do Supabase Storage e testar manualmente.",
  ffmpeg_not_found:
    "ffmpeg-static não encontrado no bundle da Vercel. Verificar se `outputFileTracingIncludes` está configurado no next.config.mjs e fazer novo deploy.",
  ffmpeg_error:
    "ffmpeg saiu com código de erro. Ver campo *Erro* para stderr. Causas: arquivo de áudio corrompido, formato não suportado pelo ffmpeg, ou limite de memória da Vercel atingido.",
  chunk_exceeds_max:
    "Áudio produziu mais de 72 chunks (~12h de gravação). Limite de segurança atingido. Verificar se o GHL está enviando o arquivo correto.",
  chunk_storage_failed:
    "Falha ao salvar chunk no Supabase Storage. Verificar se o bucket `call-audio` existe, se as permissões estão corretas, e se o plano Supabase não atingiu limite de storage.",
  db_error:
    "Erro de banco Supabase. Ver campo *Erro* para detalhes. Verificar se as migrations estão aplicadas e se a connection string está correta.",
  supabase_storage_error:
    "Supabase Storage indisponível. Ver status.supabase.com. Pode ser instabilidade temporária.",
  internal_fetch_failed:
    "Fetch interno falhou (rota /api/calls/chunk ou /api/calls/process-chunks). Causas: URL base incorreta, cold start timeout, INTERNAL_API_SECRET errado. Ver VERCEL_URL e NEXT_PUBLIC_APP_URL.",
  unknown:
    "Erro não classificado. Ver campo *Erro* para stack trace completo e buscar no Vercel logs pelos prefixos [ghl-webhook], [ghl-pipeline], [chunk-pipeline].",
}

/** Emoji por causa — aparece inline no campo Causa. */
const REASON_EMOJI: Partial<Record<PipelineFailureReason, string>> = {
  missing_openai_api_key: "🔑",
  missing_internal_api_secret: "🔑",
  missing_app_url: "🌐",
  ghl_auth_expired: "🔐",
  ghl_api_error: "🌐",
  recording_not_found: "📭",
  recording_url_expired: "🗑️",
  recording_too_large: "📦",
  whisper_timeout: "⏱️",
  whisper_http_4xx: "❌",
  whisper_http_5xx: "💥",
  whisper_rate_limit: "🚦",
  whisper_invalid_format: "🎵",
  whisper_empty_response: "🔇",
  ffmpeg_not_found: "🔧",
  ffmpeg_error: "🔧",
  chunk_exceeds_max: "📏",
  chunk_storage_failed: "💾",
  db_error: "🗄️",
  supabase_storage_error: "💾",
  internal_fetch_failed: "🔌",
  unknown: "❓",
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitário: detecta a reason a partir da mensagem de erro (fallback)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tenta inferir a causa específica a partir da mensagem de erro quando o caller
 * não passou `reason` explicitamente. Permite retrocompatibilidade — callers
 * antigos que passam só `error` ainda recebem diagnóstico melhorado.
 */
export function inferFailureReason(err: unknown): PipelineFailureReason {
  const msg = err instanceof Error ? err.message : String(err ?? "")
  const lower = msg.toLowerCase()

  if (lower.includes("openai_api_key") || lower.includes("api key") && lower.includes("not configured"))
    return "missing_openai_api_key"
  if (lower.includes("internal_api_secret"))
    return "missing_internal_api_secret"
  if (lower.includes("vercel_url") || lower.includes("next_public_app_url") || lower.includes("selfbaseurl"))
    return "missing_app_url"
  if (lower.includes("whisper api error 429") || lower.includes("rate limit"))
    return "whisper_rate_limit"
  if (/whisper api error 4\d\d/.test(lower))
    return "whisper_http_4xx"
  if (/whisper api error 5\d\d/.test(lower))
    return "whisper_http_5xx"
  if (lower.includes("aborterror") || lower.includes("timed out") || lower.includes("timeout") || lower.includes("aborted"))
    return "whisper_timeout"
  if (lower.includes("whisper falhou") || lower.includes("whisper failed"))
    return "whisper_empty_response"
  if (lower.includes("ffmpeg") && (lower.includes("not found") || lower.includes("enoent")))
    return "ffmpeg_not_found"
  if (lower.includes("ffmpeg"))
    return "ffmpeg_error"
  if (lower.includes("exceeds") && lower.includes("chunk"))
    return "chunk_exceeds_max"
  if (lower.includes("200") && (lower.includes("mb") || lower.includes("too large") || lower.includes("size")))
    return "recording_too_large"
  if (lower.includes("404") || lower.includes("410") || lower.includes("not found") && lower.includes("recording"))
    return "recording_url_expired"
  if (lower.includes("fetch failed") || lower.includes("econnrefused") || lower.includes("enotfound"))
    return "internal_fetch_failed"
  if (lower.includes("storage") || lower.includes("bucket"))
    return "supabase_storage_error"
  if (lower.includes("supabase") || lower.includes("postgres") || lower.includes("database"))
    return "db_error"

  return "unknown"
}

// ─────────────────────────────────────────────────────────────────────────────
// Função principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Best-effort alert para falhas terminais do pipeline GHL. Se a env
 * PIPELINE_ALERT_WEBHOOK_URL não está setada, vira no-op. Se o POST falha,
 * loga mas não propaga — o pipeline nunca deve quebrar por causa do alerta.
 *
 * Campos visíveis no Slack:
 *   - Header: emoji + título do status
 *   - Call ID / Org ID / Contact ID
 *   - Stage (etapa onde falhou) + Status (processing_status)
 *   - Causa (reason granular com emoji)
 *   - Erro raw (mensagem da exception, truncada)
 *   - Meta (dados extras: HTTP status, file size, URL, etc.)
 *   - Dica de ação (específica por reason, ou genérica por status)
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
      ? `${context.error.message}${context.error.stack ? `\n\n${context.error.stack}` : ""}`
      : String(context.error)
    : null

  // Inferir reason se não foi passado explicitamente
  const reason: PipelineFailureReason =
    context.reason ?? (context.error ? inferFailureReason(context.error) : "unknown")

  const reasonEmoji = REASON_EMOJI[reason] ?? "❓"
  const actionHint = REASON_HINT[reason] ?? display.hint

  const fallbackText = `${display.emoji} ${display.title} — ${status} (callId: ${context.callId})`

  // ── Campos principais ──────────────────────────────────────────────────────
  const fields: Array<{ type: "mrkdwn"; text: string }> = [
    { type: "mrkdwn", text: `📞 *Call ID*\n\`${context.callId}\`` },
    { type: "mrkdwn", text: `🏢 *Org ID*\n\`${context.orgId ?? "—"}\`` },
  ]

  if (context.contactId) {
    fields.push({ type: "mrkdwn", text: `👤 *Contact ID*\n\`${context.contactId}\`` })
  }

  fields.push(
    { type: "mrkdwn", text: `⚙️ *Status*\n\`${status}\`` },
    { type: "mrkdwn", text: `🗂️ *Stage*\n\`${context.stage ?? "—"}\`` },
    { type: "mrkdwn", text: `${reasonEmoji} *Causa*\n\`${reason}\`` },
  )

  // ── Blocos ─────────────────────────────────────────────────────────────────
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: { type: "plain_text", text: `${display.emoji} ${display.title}`, emoji: true },
    },
    { type: "section", fields },
  ]

  // Mensagem de erro raw
  if (errorText) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Erro:*\n\`\`\`${truncate(errorText, 700)}\`\`\``,
      },
    })
  }

  // Metadados extras (HTTP status, file size, URL, etc.)
  if (context.meta && Object.keys(context.meta).length > 0) {
    const metaLines = Object.entries(context.meta)
      .map(([k, v]) => `• *${k}:* \`${String(v)}\``)
      .join("\n")
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Diagnóstico:*\n${metaLines}` },
    })
  }

  // Dica de ação específica
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*Ação:* ${actionHint}` },
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
    attachments: [{ color: display.color, blocks }],
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
    console.error("[pipeline-alerts] failed to post", { err, status, callId: context.callId })
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + "…"
}
