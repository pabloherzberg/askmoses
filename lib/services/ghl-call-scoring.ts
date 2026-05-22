import { dbGetCallById, dbUpdateGhlCallPipeline } from "@/lib/db/calls"
import { dbGetDefaultRubricWithCriteria } from "@/lib/db/rubric"
import {
  DEFAULT_SECTIONS,
  buildDefaultSystemPrompt,
  scoreTranscript,
  type ScoredItem,
} from "@/lib/services/scoring"

/**
 * Roda scoring na call já transcrita pelo pipeline GHL.
 *
 * Diferente de `app/api/analyze/route.ts`:
 *   - sem auth/subscription/plan-limit (rodando em background async).
 *   - lê transcript da call existente; não recebe via body.
 *   - chama `dbUpdateGhlCallPipeline` (UPDATE) em vez de `dbCreateCall`
 *     (INSERT) — a call do GHL já existe desde o upsert do webhook.
 *   - usa rubric default da org. Não suporta `scriptId` (no contexto GHL
 *     hoje não temos como mapear webhook → script específico).
 *
 * Erros são lançados e devem ser tratados pelo caller (pipeline) como
 * best-effort: transcript já está salvo, score fica null se isso falhar.
 */
export async function runGhlCallScoring(callId: string): Promise<void> {
  const call = await dbGetCallById(callId)
  if (!call) {
    throw new Error(`runGhlCallScoring: call ${callId} not found`)
  }
  if (!call.transcript) {
    throw new Error(`runGhlCallScoring: call ${callId} has no transcript`)
  }
  if (!call.org_id) {
    throw new Error(`runGhlCallScoring: call ${callId} has no org_id`)
  }

  // Tenta rubric default da org. Se não tiver, usa DEFAULT_SECTIONS como
  // fallback — pior caso a call aparece com sections genéricas em vez de
  // não ter score nenhum.
  let rubricData = null
  try {
    rubricData = await dbGetDefaultRubricWithCriteria(call.org_id)
  } catch (err) {
    console.warn("[ghl-scoring] rubric fetch failed, using defaults", {
      callId,
      orgId: call.org_id,
      err: err instanceof Error ? err.message : String(err),
    })
  }

  const rubricId = rubricData?.rubric.id ?? null
  const systemPrompt = rubricData?.rubric.system_prompt ?? buildDefaultSystemPrompt()
  const llmModel = rubricData?.rubric.llm_model ?? null

  const scoredItems: ScoredItem[] = (() => {
    const criteria = rubricData?.criteria ?? []
    if (criteria.length > 0) {
      return criteria.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? "",
        weight:
          typeof (c as unknown as Record<string, unknown>)["weight"] === "number"
            ? ((c as unknown as Record<string, unknown>)["weight"] as number)
            : undefined,
        critical: Boolean(
          (c as unknown as Record<string, unknown>)["is_critical"],
        ),
        source: "rubric" as const,
      }))
    }
    return DEFAULT_SECTIONS.map((s) => ({
      name: s.name,
      description: s.description,
      weight: undefined,
      critical: s.critical,
      source: "default" as const,
    }))
  })()

  const framework =
    rubricData?.criteria.map((c) => ({
      name: c.name,
      description: c.description ?? "",
    })) ?? []

  const result = await scoreTranscript({
    transcript: call.transcript,
    scoredItems,
    framework,
    systemPrompt,
    llmModel,
    trainerName: call.trainer_name ?? undefined,
    clientName: call.client_name ?? undefined,
    reportedOutcome: call.call_outcome ?? undefined,
  })

  await dbUpdateGhlCallPipeline(callId, {
    rubricId,
    overallScore: result.overallScore,
    detectedOutcome: result.detectedOutcome,
    summary: result.summary,
    strengths: result.strengths,
    improvements: result.improvements,
    sections: result.sections as unknown as Record<string, unknown>[],
    modelUsed: result.modelUsed,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    promptVersion: result.promptVersion,
  })

  console.info("[ghl-scoring] scored call", {
    callId,
    orgId: call.org_id,
    overallScore: result.overallScore,
    sectionsCount: result.sections.length,
    costUsd: result.costUsd,
  })
}
