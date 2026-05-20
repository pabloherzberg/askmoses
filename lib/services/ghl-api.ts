const DEFAULT_BASE = "https://services.leadconnectorhq.com"
const API_VERSION = "2021-04-15"
const MAX_RECORDING_BYTES = 200 * 1024 * 1024 // 200 MB cap defensivo
const MAX_CONVERSATIONS_TO_SCAN = 5

export interface RecordingRef {
  url: string
  messageId: string
  conversationId: string
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
  lastMessageDate?: string
}

interface GhlMessage {
  id: string
  type: string | number
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
    throw new Error(
      `GHL conversations/search failed ${convRes.status}: ${body}`,
    )
  }

  const convData = (await convRes.json()) as {
    conversations?: GhlConversation[]
  }
  const conversations = convData.conversations ?? []

  for (const conv of conversations) {
    const msgRes = await fetch(
      `${base}/conversations/${encodeURIComponent(conv.id)}/messages`,
      { headers },
    )
    if (!msgRes.ok) continue

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

    for (const msg of callMessages) {
      const url = extractRecordingUrl(msg)
      if (url) {
        return { url, messageId: msg.id, conversationId: conv.id }
      }
    }
  }

  return null
}

function isCallMessage(msg: GhlMessage): boolean {
  if (typeof msg.type === "string") {
    return msg.type.toUpperCase().includes("CALL")
  }
  // GHL also returns numeric type codes; 25/26 are CALL_INBOUND/CALL_OUTBOUND.
  return msg.type === 25 || msg.type === 26
}

function extractRecordingUrl(msg: GhlMessage): string | null {
  const metaUrl = msg.meta?.call?.recordingUrl
  if (metaUrl) return metaUrl

  for (const att of msg.attachments ?? []) {
    if (typeof att === "string" && att.startsWith("http")) return att
    if (att && typeof att === "object" && att.url) return att.url
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
