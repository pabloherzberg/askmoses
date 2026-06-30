import {
  dbGetUnlinkedCallsByGhlUser,
  dbUpdateGhlCallPipeline,
  type UnlinkedCallRow,
} from "@/lib/db/calls"
import { dbGetOrgGhlConfigByOrgId } from "@/lib/db/organizations"
import { dbGetTrainerByGhlUserId } from "@/lib/db/trainers"
import { processGhlCall } from "@/lib/services/ghl-call-pipeline"
import type { GhlWebhookPayload } from "@/lib/services/ghl-helpers"

/**
 * Reconstrói o payload do webhook a partir do envelope salvo em calls.ghl_payload.
 * O webhook persiste o rawBody inteiro ({ customData, location, workflow }); os
 * campos da call (contactId, userId, etc.) vivem em customData. O reprocess
 * manual usa o mesmo desempacotamento (ver app/api/calls/[id]/reprocess).
 */
function reconstructPayload(
  ghlPayload: Record<string, unknown> | null,
): GhlWebhookPayload | null {
  if (!ghlPayload) return null
  const customData = (ghlPayload.customData ?? ghlPayload) as Record<string, unknown>
  const contactId = customData?.contactId
  if (typeof contactId !== "string" || contactId.trim() === "") return null
  return customData as unknown as GhlWebhookPayload
}

/**
 * Recuperação automática de calls bloqueadas (processing_status='unlinked_trainer').
 *
 * Disparada quando um GHLUSERID passa a ser um membro ATIVO — seja porque o
 * owner acabou de vinculá-lo a um membro já com invite aceito, seja porque o
 * membro vinculado aceitou o invite. Para cada call bloqueada desse GHLUSERID:
 *   1) atribui o trainer (trainer_id) e tira do estado bloqueado;
 *   2) reexecuta o pipeline completo (fetch recording → download → chunking),
 *      reusando processGhlCall com o payload original salvo.
 *
 * Best-effort e idempotente: se o vínculo ainda não estiver ativo, ou a org não
 * tiver integração GHL ativa, é no-op (as calls seguem bloqueadas). Falha numa
 * call não impede as demais. NÃO deve ser awaited no caminho da request —
 * chamar via after() para não bloquear a resposta (cada call pode levar ~6min).
 */
export async function recoverUnlinkedCalls(
  orgId: string,
  ghlUserId: string | null | undefined,
): Promise<void> {
  const normalized = ghlUserId?.trim()
  if (!normalized) return

  // Só recupera se o vínculo está ATIVO (membro existe + invite aceito).
  const link = await dbGetTrainerByGhlUserId(orgId, normalized)
  if (!link || !link.inviteAccepted) return

  const blocked = await dbGetUnlinkedCallsByGhlUser(orgId, normalized)
  if (blocked.length === 0) return

  // Sem token GHL ativo não dá pra rebaixar a gravação — deixa bloqueado.
  const cfg = await dbGetOrgGhlConfigByOrgId(orgId)
  if (!cfg) {
    console.warn("[ghl-recovery] org sem integração GHL ativa — calls seguem bloqueadas", {
      orgId,
      ghlUserId: normalized,
      count: blocked.length,
    })
    return
  }

  console.info("[ghl-recovery] reprocessando calls bloqueadas", {
    orgId,
    ghlUserId: normalized,
    trainerId: link.trainerId,
    count: blocked.length,
  })

  for (const call of blocked) {
    await recoverOne(call, orgId, link.trainerId, cfg.accessToken)
  }
}

async function recoverOne(
  call: UnlinkedCallRow,
  orgId: string,
  trainerId: string,
  accessToken: string,
): Promise<void> {
  try {
    const payload = reconstructPayload(call.ghl_payload)
    if (!payload) {
      // contactId é obrigatório no ingest, então isso é praticamente inalcançável;
      // marcamos como falha pra não deixar a call presa em 'unlinked_trainer'.
      console.warn("[ghl-recovery] payload sem contactId — não reprocessável", { callId: call.id })
      await dbUpdateGhlCallPipeline(call.id, { processingStatus: "transcription_failed" })
      return
    }

    // Atribui o membro e tira do estado bloqueado antes de rodar o pipeline.
    await dbUpdateGhlCallPipeline(call.id, { trainerId, processingStatus: "pending" })

    // Reusa o pipeline padrão (mesma lógica de retry/alertas do webhook).
    await processGhlCall(call.id, payload, { accessToken, orgId })
  } catch (err) {
    console.error("[ghl-recovery] falha ao reprocessar call", {
      callId: call.id,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}
