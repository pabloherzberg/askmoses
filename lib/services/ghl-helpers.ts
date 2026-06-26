import { createHash } from "node:crypto"

export interface GhlWebhookPayload {
  type: string
  contactId: string
  userId?: string | null
  callStatus?: string | null
  callDirection?: string | null
  transcript?: string | null
  userName?: string | null
  userEmail?: string | null
  contactName?: string | null
  duration?: string | number | null
  contactSource?: string | null
  contactEmail?: string | null
  locationId?: string | null
}

// O Pepper envia o request com os campos nativos do GHL no root
// (contact, location, workflow, message, etc.) e os campos que adicionamos
// via "Custom Data" aninhados em `customData`. Persistir o envelope completo
// em ghl_payload preserva contexto útil pra debug (location.id, workflow.name).
export interface GhlRawWebhookBody {
  customData?: GhlWebhookPayload | GhlAppointmentPayload
  location?: { id?: string | null }
  workflow?: { id?: string; name?: string }
}

// Evento de AGENDAMENTO do GHL (o "one"/agendamento — Melinda agendou Jamila).
// NÃO confundir com paying client (Stage 2). type discrimina do callCompleted.
export interface GhlAppointmentPayload {
  type: string // "appointmentScheduled" | "appointmentCreated" | "appointmentBooked"
  appointmentId?: string | null
  contactId?: string | null
  contactName?: string | null
  userId?: string | null
  userName?: string | null
  userEmail?: string | null
  // ISO 8601 do horário agendado (GHL usa startTime/selectedSlot conforme fonte).
  startTime?: string | null
  selectedSlot?: string | null
  appointmentStatus?: string | null
  locationId?: string | null
}

// Tipos de evento de agendamento que aceitamos. O Pepper pode salvar com
// aspas/whitespace, então normalizamos antes de comparar.
const APPOINTMENT_TYPES = new Set([
  'appointmentscheduled',
  'appointmentcreated',
  'appointmentbooked',
  'appointment',
])

export function normalizeWebhookType(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/^"+|"+$/g, '') : ''
}

export function isAppointmentType(type: string): boolean {
  return APPOINTMENT_TYPES.has(type.toLowerCase())
}

export type CallType =
  | "cold_inbound"
  | "warm_inbound"
  | "scheduled_followup"
  | "unknown"

export type LeadSource =
  | "facebook"
  | "google"
  | "organic"
  | "referral"
  | "other"

const VALID_LEAD_SOURCES: readonly LeadSource[] = [
  "facebook",
  "google",
  "organic",
  "referral",
  "other",
] as const

export function normalizeEmpty(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

export function normalizeSource(
  source: string | null | undefined,
): LeadSource | null {
  const normalized = normalizeEmpty(source)
  if (!normalized) return null
  const lowered = normalized.toLowerCase() as LeadSource
  return (VALID_LEAD_SOURCES as readonly string[]).includes(lowered)
    ? lowered
    : "other"
}

export function parseDuration(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

export function detectCallType(
  direction: string | null | undefined,
  contactId: string | null | undefined,
): CallType {
  const dir = normalizeEmpty(direction)?.toLowerCase()
  if (!dir) return "unknown"
  if (dir === "inbound") {
    // TODO: olhar histórico do contactId para distinguir cold vs warm.
    // Por enquanto, sem histórico, todo inbound é tratado como cold.
    void contactId
    return "cold_inbound"
  }
  return "scheduled_followup"
}

/**
 * Hash determinístico para idempotência. O mesmo webhook reenviado
 * pelo GHL gera o mesmo external_call_id e cai no UNIQUE INDEX,
 * evitando dupla ingestão. Inclui apenas campos estáveis (não usa
 * Date.now()).
 */
export function buildExternalCallId(payload: GhlWebhookPayload): string {
  const parts = [
    payload.contactId ?? "",
    payload.userId ?? "",
    payload.callStatus ?? "",
    payload.callDirection ?? "",
    String(parseDuration(payload.duration) ?? ""),
  ]
  const canonical = parts.join("|")
  const hash = createHash("sha256").update(canonical).digest("hex")
  return `ghl_${hash}`
}

