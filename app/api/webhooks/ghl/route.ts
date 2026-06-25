import { timingSafeEqual } from "node:crypto"
import { after, type NextRequest, NextResponse } from "next/server"
import { dbUpsertGhlCall, dbUpdateGhlCallPipeline } from "@/lib/db/calls"
import { dbGetOrgGhlConfigByLocation } from "@/lib/db/organizations"
import { processGhlCall } from "@/lib/services/ghl-call-pipeline"
import { notifyPipelineFailure } from "@/lib/services/pipeline-alerts"
import {
  buildExternalCallId,
  normalizeEmpty,
  normalizeSource,
  parseDuration,
  normalizeWebhookType,
  isAppointmentType,
  type GhlRawWebhookBody,
  type GhlAppointmentPayload,
} from "@/lib/services/ghl-helpers"
import { dbUpsertGhlAppointment } from "@/lib/db/appointments"
import { MIN_ANALYZABLE_CALL_SECONDS, isConfirmedShortCall } from "@/lib/constants/limits"

export const runtime = "nodejs"
// Vercel Teams + Fluid Compute permitem até 800s. O download da gravação agora
// tem retry com espera (60+120+180s = ~6min) porque o GHL processa o áudio de
// forma assíncrona após o webhook — 300s não cabia, 800s dá folga pro pipeline
// completo (retries + download + upload pro Storage + disparo do chunking).
export const maxDuration = 800

export async function POST(req: NextRequest) {
  // 1. Identifica a org pelo header X-GHL-Location-Id. URL é única para
  //    todos os clientes; cada org configura o próprio locationId no Pepper.
  const locationId = normalizeEmpty(req.headers.get("x-ghl-location-id"))
  if (!locationId) {
    return jsonError("X-GHL-Location-Id header required", 400)
  }

  // 2. Lookup das credenciais. Retorna null se a org não existe,
  //    se a integração está desativada, ou se faltam credenciais.
  let orgConfig
  try {
    orgConfig = await dbGetOrgGhlConfigByLocation(locationId)
  } catch (err) {
    console.error("[ghl-webhook] lookup failed", { err, locationId })
    void notifyPipelineFailure("webhook_failed", {
      callId: `sync-error:lookup:${locationId}`,
      error: err instanceof Error ? `[lookup] ${err.message}` : String(err),
      stage: "webhook",
      reason: "db_error",
      meta: { locationId, operation: "dbGetOrgGhlConfigByLocation" },
    })
    return jsonError("Server error", 500)
  }
  if (!orgConfig) {
    // Webhook real do GHL (tem locationId) mas a org não existe ou está
    // desativada — a call está sendo PERDIDA. Sem alerta, ninguém fica sabendo.
    console.warn("[ghl-webhook] unknown/disabled location", { locationId })
    void notifyPipelineFailure("webhook_rejected", {
      callId: `rejected:unknown-location:${locationId}`,
      stage: "webhook",
      reason: "webhook_unknown_location",
      meta: { locationId, httpStatus: 404 },
    })
    return jsonError("Unknown or disabled location", 404)
  }

  // 3. Valida o secret per-org via comparação timing-safe.
  const secretHeader = req.headers.get("x-askmoses-secret") ?? ""
  if (!safeEqual(secretHeader, orgConfig.webhookSecret)) {
    // Org existe mas o secret não bate — Pepper configurado com secret errado.
    // Calls dessa org estão sendo PERDIDAS até corrigirem.
    console.warn("[ghl-webhook] secret mismatch", { locationId, orgId: orgConfig.orgId })
    void notifyPipelineFailure("webhook_rejected", {
      callId: `rejected:secret-mismatch:${locationId}`,
      orgId: orgConfig.orgId,
      stage: "webhook",
      reason: "webhook_secret_mismatch",
      meta: { locationId, secretHeaderPresent: secretHeader.length > 0, httpStatus: 401 },
    })
    return jsonError("Unauthorized", 401)
  }

  // 4. Parse + validação mínima do payload.
  //    O Pepper aninha os campos de Custom Data em `customData`. Outros
  //    campos no root vêm nativos do GHL (location, workflow, etc.).
  let rawBody: GhlRawWebhookBody
  try {
    rawBody = (await req.json()) as GhlRawWebhookBody
  } catch {
    return jsonError("Invalid JSON", 400)
  }

  const payload = rawBody.customData
  if (!payload) {
    return jsonError("Missing customData in webhook body", 400)
  }

  // Defensiva: já vimos no campo o Pepper salvar com aspas e whitespace.
  const normalizedType = normalizeWebhookType(payload.type)

  // ── Evento de AGENDAMENTO (o "one"/agendamento — alimenta "agendados hoje").
  //    NÃO é paying client (Stage 2). Persiste em appointments e retorna cedo.
  if (isAppointmentType(normalizedType)) {
    return handleAppointment(
      rawBody.customData as GhlAppointmentPayload,
      rawBody as unknown as Record<string, unknown>,
      orgConfig.orgId,
      locationId,
    )
  }

  if (normalizedType !== "callCompleted") {
    console.warn("[ghl-webhook] type-check failed", {
      receivedType: payload.type,
      customDataKeys: Object.keys(payload),
      rootKeys: Object.keys(rawBody),
    })
    void notifyPipelineFailure("webhook_rejected", {
      callId: `rejected:bad-type:${locationId}`,
      orgId: orgConfig.orgId,
      stage: "webhook",
      reason: "webhook_invalid_payload",
      meta: {
        receivedType: String(payload.type ?? "—"),
        customDataKeys: Object.keys(payload).join(", "),
        httpStatus: 400,
      },
    })
    return jsonError(`Unsupported webhook type: ${payload.type}`, 400)
  }
  // A partir daqui é garantidamente callCompleted — estreita o union.
  const callPayload = payload as Extract<GhlRawWebhookBody['customData'], { callStatus?: unknown }>
  const contactId = normalizeEmpty(callPayload.contactId)
  if (!contactId) {
    void notifyPipelineFailure("webhook_rejected", {
      callId: `rejected:no-contact:${locationId}`,
      orgId: orgConfig.orgId,
      stage: "webhook",
      reason: "webhook_invalid_payload",
      meta: { missingField: "contactId", httpStatus: 400 },
    })
    return jsonError("contactId is required", 400)
  }

  // 5. Idempotência via hash determinístico.
  const externalCallId = buildExternalCallId(callPayload)
  const durationSeconds = parseDuration(callPayload.duration)

  // 5b. Pula calls confirmadamente curtas (< 30s) antes de persistir/processar —
  //     sem linha no banco, sem custo de LLM. Duração nula ou 0 NÃO corta (0 pode
  //     ser placeholder do GHL): perder uma call real pesa mais que o custo; quem
  //     decide nesses casos é o pipeline, a partir do áudio real.
  if (isConfirmedShortCall(durationSeconds)) {
    console.info("[ghl-webhook] call too short — skipping analysis", {
      orgId: orgConfig.orgId,
      externalCallId,
      durationSeconds,
      minSeconds: MIN_ANALYZABLE_CALL_SECONDS,
    })
    return NextResponse.json({
      data: { status: "skipped_too_short", durationSeconds },
      error: null,
    })
  }

  const trainerName =
    normalizeEmpty(callPayload.userName)
    ?? normalizeEmpty(callPayload.userEmail)
    ?? "Unknown trainer"
  const trainerEmail = normalizeEmpty(callPayload.userEmail)
  const clientName = normalizeEmpty(callPayload.contactName)
  const leadSource = normalizeSource(callPayload.contactSource)

  let upsertResult
  try {
    upsertResult = await dbUpsertGhlCall({
      orgId: orgConfig.orgId,
      externalCallId,
      ghlPayload: rawBody as unknown as Record<string, unknown>,
      trainerName,
      trainerEmail,
      clientName,
      leadName: clientName,
      leadSource,
      durationSeconds,
    })
  } catch (err) {
    console.error("[ghl-webhook] upsert failed", { err, externalCallId })
    void notifyPipelineFailure("webhook_failed", {
      callId: `sync-error:upsert:${externalCallId}`,
      orgId: orgConfig.orgId,
      contactId,
      error: err instanceof Error ? `[upsert] ${err.message}` : String(err),
      stage: "webhook",
      reason: "db_error",
      meta: { externalCallId, operation: "dbUpsertGhlCall" },
    })
    return jsonError("Failed to persist call", 500)
  }

  if (!upsertResult.isNew) {
    return NextResponse.json({
      data: { callId: upsertResult.call.id, status: "duplicate" },
      error: null,
    })
  }

  const callId = upsertResult.call.id
  const accessToken = orgConfig.accessToken

  // 6. Dispara pipeline async com o token específico da org.
  after(async () => {
    try {
      await processGhlCall(
        callId,
        { ...callPayload, contactId },
        { accessToken, orgId: orgConfig.orgId },
      )
    } catch (err) {
      console.error("[ghl-webhook] pipeline crashed", { callId, err })
      try {
        await dbUpdateGhlCallPipeline(callId, {
          processingStatus: "webhook_failed",
        })
      } catch (updateErr) {
        console.error("[ghl-webhook] failed to mark webhook_failed", {
          callId,
          updateErr,
        })
      }
      await notifyPipelineFailure("webhook_failed", {
        callId,
        orgId: orgConfig.orgId,
        contactId,
        error: err,
        stage: "webhook",
        meta: { note: "Crash não previsto em processGhlCall — ver stack trace acima." },
      })
    }
  })

  return NextResponse.json({
    data: { callId, status: "received" },
    error: null,
  })
}

// Ingestão de AGENDAMENTO do GHL → tabela appointments (visão "agendados hoje").
// Idempotente por (org, ghl_appointment_id). Sem pipeline async — agendamento
// não tem áudio/transcrição. Resolução de trainer_id por email fica para depois;
// guardamos trainer_name do payload.
async function handleAppointment(
  appt: GhlAppointmentPayload,
  rawBody: Record<string, unknown>,
  orgId: string,
  locationId: string | null,
) {
  const apptId =
    normalizeEmpty(appt.appointmentId) ??
    // Fallback de idempotência: sem id explícito, deriva de contato+horário.
    `${normalizeEmpty(appt.contactId) ?? "?"}:${normalizeEmpty(appt.startTime ?? appt.selectedSlot) ?? "?"}`

  const scheduledAt = normalizeEmpty(appt.startTime ?? appt.selectedSlot)
  if (!scheduledAt) {
    return jsonError("appointment missing startTime/selectedSlot", 400)
  }
  // Valida ISO; GHL manda ISO 8601. Se vier inválido, rejeita (não inventa data).
  const parsed = new Date(scheduledAt)
  if (Number.isNaN(parsed.getTime())) {
    return jsonError("appointment startTime is not a valid date", 400)
  }

  try {
    const row = await dbUpsertGhlAppointment({
      orgId,
      ghlAppointmentId: apptId,
      contactId: normalizeEmpty(appt.contactId),
      contactName: normalizeEmpty(appt.contactName),
      trainerName: normalizeEmpty(appt.userName) ?? normalizeEmpty(appt.userEmail),
      scheduledAt: parsed.toISOString(),
      status: normalizeEmpty(appt.appointmentStatus),
      ghlPayload: rawBody,
    })
    return NextResponse.json({
      data: { appointmentId: row.id, status: "received" },
      error: null,
    })
  } catch (err) {
    console.error("[ghl-webhook] appointment upsert failed", { err, locationId })
    void notifyPipelineFailure("webhook_failed", {
      callId: `sync-error:appointment:${apptId}`,
      orgId,
      error: err instanceof Error ? `[appointment] ${err.message}` : String(err),
      stage: "webhook",
      reason: "db_error",
      meta: { operation: "dbUpsertGhlAppointment", locationId },
    })
    return jsonError("Failed to persist appointment", 500)
  }
}

function safeEqual(received: string, expected: string): boolean {
  if (!received || !expected) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function jsonError(message: string, code: number) {
  return NextResponse.json(
    { data: null, error: { message, code } },
    { status: code },
  )
}
