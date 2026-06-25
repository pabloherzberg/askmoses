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

/**
 * Erro de download da gravação com o HTTP status preservado. Permite ao
 * pipeline distinguir falhas TRANSIENTES (422 = GHL ainda processando o áudio,
 * 404/410 = ainda não publicado, 429/5xx = instabilidade) — que merecem retry
 * com espera — de falhas permanentes.
 */
export class GhlDownloadError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "GhlDownloadError"
    this.status = status
  }
  /** O recording pode ficar disponível se tentarmos de novo mais tarde? */
  get isTransient(): boolean {
    return (
      this.status === 404 ||
      this.status === 410 ||
      this.status === 422 ||
      this.status === 425 ||
      this.status === 429 ||
      this.status >= 500
    )
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

/** Usuário de uma location do GHL, normalizado para o nosso uso. */
export interface GhlUser {
  /** ID do usuário no GHL — o mesmo `userId` que chega no webhook de call. */
  id: string
  name: string
  email: string
}

interface RawGhlUser {
  id?: string
  name?: string
  firstName?: string
  lastName?: string
  email?: string
}

// Paginação do endpoint /users/ do GHL. Buscamos páginas de USERS_PAGE_LIMIT
// até a API devolver uma página incompleta (ou vazia), com um teto de páginas
// como trava de segurança caso o endpoint ignore `skip` (evita loop infinito).
const USERS_PAGE_LIMIT = 100
const MAX_USERS_PAGES = 50

// Cache curto por location. A lista de usuários do GHL é refetchada em vários
// pontos próximos no tempo (combobox abrindo + validação no invite/PATCH); sem
// cache cada um vira um round-trip externo que pode esbarrar em rate limit.
const USERS_CACHE_TTL_MS = 60_000
const usersCache = new Map<string, { at: number; users: GhlUser[] }>()

/**
 * Lista os usuários de uma location do GHL. Usado para vincular um trainer
 * (vendedor) ao seu usuário no GHL na criação/edição de membros — escolher
 * da lista evita erros de digitação do ghl_user_id.
 *
 * Pagina a API (uma location pode ter mais usuários do que cabe numa página)
 * e cacheia o resultado por location por USERS_CACHE_TTL_MS. Requer um token
 * (PIT) com escopo `users.readonly`. Em 401/403 lança GhlAuthError (token
 * rotacionado/sem escopo); o caller traduz para uma resposta amigável.
 */
export async function fetchGhlUsers(
  locationId: string,
  accessToken: string,
): Promise<GhlUser[]> {
  const cached = usersCache.get(locationId)
  if (cached && Date.now() - cached.at < USERS_CACHE_TTL_MS) {
    return cached.users
  }

  const base = getApiBase()
  const headers = buildAuthHeaders(accessToken)

  // Dedup por id: defesa caso a API ignore `skip` e repita páginas, e contra
  // duplicatas eventuais no próprio retorno do GHL.
  const byId = new Map<string, GhlUser>()
  let skip = 0

  for (let page = 0; page < MAX_USERS_PAGES; page++) {
    const res = await fetch(
      `${base}/users/?locationId=${encodeURIComponent(locationId)}&limit=${USERS_PAGE_LIMIT}&skip=${skip}`,
      { headers },
    )
    if (!res.ok) {
      const body = await res.text()
      if (res.status === 401 || res.status === 403) {
        throw new GhlAuthError(
          res.status,
          `GHL users list auth failed (${res.status}): ${body}`,
        )
      }
      throw new Error(`GHL users list failed ${res.status}: ${body}`)
    }

    const data = (await res.json()) as { users?: RawGhlUser[] }
    const batch = data.users ?? []

    for (const u of batch) {
      if (!u.id || !u.email) continue
      const name =
        u.name?.trim() ||
        [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
        u.email
      byId.set(u.id, { id: u.id, name, email: u.email })
    }

    // Página incompleta = última página.
    if (batch.length < USERS_PAGE_LIMIT) break
    skip += batch.length
  }

  const users = Array.from(byId.values())
  usersCache.set(locationId, { at: Date.now(), users })
  return users
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
    throw new GhlDownloadError(
      res.status,
      `Failed to download recording: ${res.status} ${res.statusText}`,
    )
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
