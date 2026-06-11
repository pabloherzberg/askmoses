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
  type GhlRawWebhookBody,
} from "@/lib/services/ghl-helpers"

export const runtime = "nodejs"
// Vercel Teams + Fluid Compute permitem até 800s. 300s é folga confortável
// para o pipeline completo (download áudio + Whisper).
export const maxDuration = 300

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
  const normalizedType =
    typeof payload.type === "string"
      ? payload.type.trim().replace(/^"+|"+$/g, "")
      : ""
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
  const contactId = normalizeEmpty(payload.contactId)
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
  const externalCallId = buildExternalCallId(payload)

  const trainerName =
    normalizeEmpty(payload.userName)
    ?? normalizeEmpty(payload.userEmail)
    ?? "Unknown trainer"
  const trainerEmail = normalizeEmpty(payload.userEmail)
  const clientName = normalizeEmpty(payload.contactName)
  const leadSource = normalizeSource(payload.contactSource)
  const durationSeconds = parseDuration(payload.duration)

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
        { ...payload, contactId },
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
