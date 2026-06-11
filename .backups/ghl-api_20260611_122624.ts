const DEFAULT_BASE = "https://services.leadconnectorhq.com"
const API_VERSION = "2021-04-15"
const MAX_RECORDING_BYTES = 200 * 1024 * 1024 // 200 MB cap defensivo
const MAX_CONVERSATIONS_TO_SCAN = 5

export interface RecordingRef {
  url: string
  messageId: string
  conversationId: string
}

/**
 * Erro lançado quando a GHL responde 401/403 — sinaliza que o PIT da org
 * foi rotacionado/revogado no Pepper. Pipeline catch trata especificamente
 * pra marcar processing_status='auth_expired' e atualizar
 * organizations.ghl_last_auth_error_at (consumido pelo banner do admin).
 */
export class GhlAuthError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "GhlAuthError"
    this.status = status
  }
}

function buildAuthHeaders(accessToken: string): HeadersInit {
  if (!accessToken) throw new Error("GHL access token is required")
  return {
    Authorization: `Bearer ${accessToken}`,
    Version: API_VERSION,
    Accept: "application/json",
  }
}

function getApiBase(): string {
  return (process.env.GHL_API_BASE ?? DEFAULT_BASE).replace(/\/+$/, "")
}

interface GhlConversation {
  id: string
  contactId?: string
  locationId?: string
  lastMessageDate?: string
}

interface GhlMessage {
  id: string
  /** Legacy: pode ser string ("CALL", "TYPE_CALL") ou número (1=outbound,
   *  2=inbound, 25=CALL_INBOUND, 26=CALL_OUTBOUND). NÃO usar pra
   *  discriminar tipo de message — usar `messageType` que é estável. */
  type: string | number
  /** Discriminador estável do tipo (TYPE_CALL, TYPE_SMS, etc). */
  messageType?: string
  locationId?: string
  dateAdded?: string
  attachments?: Array<string | { url?: string }>
  meta?: { call?: { recordingUrl?: string } }
}

/**
 * Busca a URL do áudio da call mais recente do contato no GHL.
 * Estratégia: lista as conversas do contato (ordenadas por mais recente)
 * e, para cada conversa, varre as mensagens procurando uma de tipo CALL
 * com anexo ou meta.call.recordingUrl.
 *
 * Retorna null se não houver gravação disponível. Nesse caso o pipeline
 * marca a call como 'no_recording' e encerra.
 */
export async function fetchRecordingUrl(
  contactId: string,
  accessToken: string,
): Promise<RecordingRef | null> {
  const base = getApiBase()
  const headers = buildAuthHeaders(accessToken)

  const convRes = await fetch(
    `${base}/conversations/search?contactId=${encodeURIComponent(contactId)}&limit=${MAX_CONVERSATIONS_TO_SCAN}`,
    { headers },
  )
  if (!convRes.ok) {
    const body = await convRes.text()
    if (convRes.status === 401 || convRes.status === 403) {
      throw new GhlAuthError(
        convRes.status,
        `GHL conversations/search auth failed (${convRes.status}): ${body}`,
      )
    }
    throw new Error(
      `GHL conversations/search failed ${convRes.status}: ${body}`,
    )
  }

  const convData = (await convRes.json()) as {
    conversations?: GhlConversation[]
  }
  const conversations = convData.conversations ?? []

  console.info("[ghl-api] conversations search result", {
    contactId,
    conversationsCount: conversations.length,
    conversationIds: conversations.map((c) => c.id),
  })

  for (const conv of conversations) {
    const msgRes = await fetch(
      `${base}/conversations/${encodeURIComponent(conv.id)}/messages`,
      { headers },
    )
    if (!msgRes.ok) {
      if (msgRes.status === 401 || msgRes.status === 403) {
        throw new GhlAuthError(
          msgRes.status,
          `GHL conversations/${conv.id}/messages auth failed (${msgRes.status})`,
        )
      }
      continue
    }

    const msgData = (await msgRes.json()) as {
      messages?: { messages?: GhlMessage[] } | GhlMessage[]
    }
    const raw = msgData.messages
    const messages: GhlMessage[] = Array.isArray(raw)
      ? raw
      : (raw?.messages ?? [])

    const callMessages = messages
      .filter((m) => isCallMessage(m))
      .sort((a, b) => {
        const ta = a.dateAdded ? Date.parse(a.dateAdded) : 0
        const tb = b.dateAdded ? Date.parse(b.dateAdded) : 0
        return tb - ta
      })

    console.info("[ghl-api] conversation messages", {
      conversationId: conv.id,
      messagesCount: messages.length,
      callMessagesCount: callMessages.length,
      messageTypes: messages.map((m) => ({ type: m.type, messageType: m.messageType })),
      callMessages: callMessages.map((m) => ({
        id: m.id,
        type: m.type,
        messageType: m.messageType,
        dateAdded: m.dateAdded,
        hasMetaRecording: Boolean(m.meta?.call?.recordingUrl),
        attachmentsCount: m.attachments?.length ?? 0,
        locationId: m.locationId,
      })),
    })

    for (const msg of callMessages) {
      const url = extractRecordingUrl(msg, conv.locationId, base)
      if (url) {
        return { url, messageId: msg.id, conversationId: conv.id }
      }
    }
  }

  console.warn("[ghl-api] no recording extractable from any conversation", {
    contactId,
    scannedConversations: conversations.length,
  })
  return null
}

function isCallMessage(msg: GhlMessage): boolean {
  // Discriminador estável: messageType. GHL atual envia "TYPE_CALL"
  // mesmo em locations LC Phone / Twilio. Confirmado via curl manual.
  if (typeof msg.messageType === "string" && msg.messageType.toUpperCase().includes("CALL")) {
    return true
  }
  // Legacy: campo `type` em string.
  if (typeof msg.type === "string") {
    return msg.type.toUpperCase().includes("CALL")
  }
  // Legacy: códigos numéricos (vistos em listings antigos).
  // 25 = CALL_INBOUND, 26 = CALL_OUTBOUND. Mantido por compatibilidade.
  return msg.type === 25 || msg.type === 26
}

function extractRecordingUrl(
  msg: GhlMessage,
  conversationLocationId: string | undefined,
  apiBase: string,
): string | null {
  // Legacy 1: gravação embutida no meta. Algumas integrações ainda enviam.
  const metaUrl = msg.meta?.call?.recordingUrl
  if (metaUrl) return metaUrl

  // Legacy 2: URL em attachment.
  for (const att of msg.attachments ?? []) {
    if (typeof att === "string" && att.startsWith("http")) return att
    if (att && typeof att === "object" && att.url) return att.url
  }

  // Atual (LC Phone + Pepper): o áudio fica no endpoint dedicado, não
  // vem inline no listing de messages. Construir a URL e deixar o
  // downloadRecording resolver com Bearer auth.
  const locationId = msg.locationId ?? conversationLocationId
  if (locationId) {
    return `${apiBase}/conversations/messages/${encodeURIComponent(msg.id)}/locations/${encodeURIComponent(locationId)}/recording`
  }

  return null
}

export interface DownloadedRecording {
  buffer: Buffer
  mimeType: string
  byteLength: number
}

export async function downloadRecording(
  url: string,
  accessToken: string,
): Promise<DownloadedRecording> {
  // Algumas URLs do GHL exigem o Bearer token (são endpoints da própria API
  // disfarçados como links). Outras são S3 pré-assinados que rejeitam o
  // header. Tentamos primeiro com auth; em 401/403 reenviamos sem.
  const headers = buildAuthHeaders(accessToken)

  let res = await fetch(url, { headers })
  if (res.status === 401 || res.status === 403) {
    res = await fetch(url)
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new GhlAuthError(
        res.status,
        `Failed to download recording: auth rejected (${res.status})`,
      )
    }
    throw new Error(`Failed to download recording: ${res.status} ${res.statusText}`)
  }

  const contentLength = Number.parseInt(
    res.headers.get("content-length") ?? "",
    10,
  )
  if (Number.isFinite(contentLength) && contentLength > MAX_RECORDING_BYTES) {
    throw new Error(
      `Recording too large: ${contentLength} bytes (cap ${MAX_RECORDING_BYTES})`,
    )
  }

  const arrayBuffer = await res.arrayBuffer()
  if (arrayBuffer.byteLength > MAX_RECORDING_BYTES) {
    throw new Error(
      `Recording too large: ${arrayBuffer.byteLength} bytes (cap ${MAX_RECORDING_BYTES})`,
    )
  }

  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim()
    || "audio/mpeg"

  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType,
    byteLength: arrayBuffer.byteLength,
  }
}
