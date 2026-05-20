import { timingSafeEqual } from "node:crypto"
import { after, type NextRequest, NextResponse } from "next/server"
import { dbUpsertGhlCall, dbUpdateGhlCallPipeline } from "@/lib/db/calls"
import { dbGetOrgGhlConfigByLocation } from "@/lib/db/organizations"
import { processGhlCall } from "@/lib/services/ghl-call-pipeline"
import {
  buildExternalCallId,
  normalizeEmpty,
  normalizeSource,
  parseDuration,
  type GhlWebhookPayload,
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
    return jsonError("Server error", 500)
  }
  if (!orgConfig) {
    return jsonError("Unknown or disabled location", 404)
  }

  // 3. Valida o secret per-org via comparação timing-safe.
  const secretHeader = req.headers.get("x-askmoses-secret") ?? ""
  if (!safeEqual(secretHeader, orgConfig.webhookSecret)) {
    return jsonError("Unauthorized", 401)
  }

  // 4. Parse + validação mínima do payload.
  let payload: GhlWebhookPayload
  try {
    payload = (await req.json()) as GhlWebhookPayload
  } catch {
    return jsonError("Invalid JSON", 400)
  }

  if (payload.type !== "callCompleted") {
    return jsonError(`Unsupported webhook type: ${payload.type}`, 400)
  }
  const contactId = normalizeEmpty(payload.contactId)
  if (!contactId) {
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
      ghlPayload: payload as unknown as Record<string, unknown>,
      trainerName,
      trainerEmail,
      clientName,
      leadName: clientName,
      leadSource,
      durationSeconds,
    })
  } catch (err) {
    console.error("[ghl-webhook] upsert failed", { err, externalCallId })
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
      await processGhlCall(callId, { ...payload, contactId }, { accessToken })
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
