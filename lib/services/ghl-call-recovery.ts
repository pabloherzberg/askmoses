import {
  dbGetFrontDeskCallsByGhlUser,
  dbReassignCallsToTrainer,
  isInFlightCall,
} from "@/lib/db/calls"
import {
  dbGetFrontDeskTrainerId,
  dbGetTrainerByGhlUserId,
  syncTrainerStats,
} from "@/lib/db/trainers"

/**
 * Migra as calls do Front Desk para o rep real, quando o GHLUSERID delas passa
 * a ser um membro ATIVO — seja porque o owner acabou de vinculá-lo a um membro
 * com invite aceito, seja porque o membro vinculado aceitou o invite.
 *
 * A atribuição ao Front Desk é PROVISÓRIA por definição de produto: a call
 * entra, é transcrita e pontuada na hora (o dono do negócio vê a conversa no
 * mesmo dia), e quando o vendedor é cadastrado ela passa pra ele com a nota
 * junto — o crédito é dele.
 *
 * ─── O que mudou em relação à 096 ──────────────────────────────────────────
 * A versão anterior desta função recuperava calls BLOQUEADAS
 * (processing_status='unlinked_trainer'), que nunca tinham sido processadas: ela
 * atribuía o trainer e rodava processGhlCall do zero — download da gravação,
 * Whisper, chunking, ~6min por call, e exigia token GHL ativo na org.
 *
 * Agora a call já está transcrita e pontuada. Reatribuir é trocar trainer_id e
 * ressincronizar os dois reps afetados. Três consequências:
 *   • não precisa de token GHL — org com integração desativada também migra;
 *   • roda em milissegundos em vez de ~6min por call, então o `after()` dos
 *     dois gatilhos termina junto com a request em vez de ficar pendurado;
 *   • o histórico semanal se corrige sozinho, porque o UPDATE bumpa
 *     calls.updated_at e o stamp_call_stats_weekly (107) reprocessa por
 *     watermark de updated_at.
 *
 * Best-effort e idempotente. NUNCA lança: os dois chamadores já a envolvem em
 * try/catch dentro de `after()`, então o catch aqui é defesa em profundidade —
 * torna o contrato explícito e garante que um terceiro chamador futuro não
 * herde uma exceção no meio de um fluxo de auth.
 */
export async function reassignFrontDeskCalls(
  orgId: string,
  ghlUserId: string | null | undefined,
): Promise<void> {
  const normalized = ghlUserId?.trim()
  if (!normalized) return

  try {
    // Só migra se o vínculo está ATIVO (membro existe + invite aceito). Com
    // invite pendente a call não fica no Front Desk de todo jeito — o webhook
    // já atribui ao rep real e só emite o alerta de pendência —, então aqui
    // isso é apenas o contrato antigo preservado.
    const link = await dbGetTrainerByGhlUserId(orgId, normalized)
    if (!link || !link.inviteAccepted) return

    const frontDeskId = await dbGetFrontDeskTrainerId(orgId)
    // Org que nunca recebeu call órfã não tem Front Desk provisionado.
    if (!frontDeskId) return

    // Defensivo: se o GHLUSERID estiver vinculado ao PRÓPRIO Front Desk, migrar
    // seria mover a call pra ela mesma. O guard do PATCH de membership impede
    // esse vínculo, mas a linha pode ter sido gravada antes dele existir.
    if (link.trainerId === frontDeskId) {
      console.warn("[front-desk-reassign] ghl_user_id vinculado ao próprio Front Desk", {
        orgId,
        ghlUserId: normalized,
        frontDeskId,
      })
      return
    }

    const candidates = await dbGetFrontDeskCallsByGhlUser(orgId, frontDeskId, normalized)
    if (candidates.length === 0) return

    const ready = candidates.filter((c) => !isInFlightCall(c.processing_status))
    const inFlight = candidates.length - ready.length

    if (ready.length === 0) {
      console.info("[front-desk-reassign] todas as calls ainda em voo — nada a migrar agora", {
        orgId,
        ghlUserId: normalized,
        inFlight,
      })
      return
    }

    const moved = await dbReassignCallsToTrainer(
      ready.map((c) => c.id),
      {
        trainerId: link.trainerId,
        trainerName: link.name,
        trainerEmail: link.email,
      },
    )

    // Os DOIS reps: o Front Desk perdeu essas calls do seu score/close rate, o
    // rep real ganhou. Sincronizar só um deixaria o snapshot do outro mentindo
    // no leaderboard até o próximo /api/sync-trainers.
    await Promise.all([syncTrainerStats(frontDeskId), syncTrainerStats(link.trainerId)])

    console.info("[front-desk-reassign] calls migradas do Front Desk pro rep real", {
      orgId,
      ghlUserId: normalized,
      trainerId: link.trainerId,
      moved,
      // > 0 aqui é normal: essas migram no próximo gatilho.
      skippedInFlight: inFlight,
    })
  } catch (err) {
    console.error("[front-desk-reassign] falha ao migrar calls", {
      orgId,
      ghlUserId: normalized,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}
