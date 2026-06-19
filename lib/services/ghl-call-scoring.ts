import { dbGetCallById, dbUpdateGhlCallPipeline } from "@/lib/db/calls";
import { dbGetDefaultRubricWithCriteria } from "@/lib/db/rubric";
import { dbGetScriptById, type DbScript } from "@/lib/db/scripts";
import { syncTrainerStats } from "@/lib/db/trainers";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordLlmUsage } from "@/lib/services/llm-usage";
import {
  DEFAULT_SECTIONS,
  buildDefaultSystemPrompt,
  scoreTranscript,
  type ScoredItem,
} from "@/lib/services/scoring";
import {
  scoreIntentFromTranscript,
  type IntentScoringInput,
} from "@/lib/services/intent-scoring";
import { getOrgIntentWeightsForScoring } from "@/lib/services/intent";
import type { IntentBreakdown } from "@/lib/types";

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
  const call = await dbGetCallById(callId);
  if (!call) {
    throw new Error(`runGhlCallScoring: call ${callId} not found`);
  }
  if (!call.transcript) {
    throw new Error(`runGhlCallScoring: call ${callId} has no transcript`);
  }
  if (!call.orgId) {
    throw new Error(`runGhlCallScoring: call ${callId} has no org_id`);
  }

  // Prioridade de resolução (alinhado com /api/analyze):
  //   1. Script ATIVO da org (via org_scripts_current). Owner aprovou esse
  //      script — é o playbook oficial pelo qual as calls são avaliadas.
  //   2. Rubric default da org (fallback se org não tem script ativo).
  //   3. DEFAULT_SECTIONS hardcoded (fallback se nem rubric default).
  //
  // Script tem sections (scored items); rubric vira "framework" no prompt
  // (contexto pra LLM, não scored).
  let script: DbScript | null = null;
  let rubricData: Awaited<ReturnType<typeof dbGetDefaultRubricWithCriteria>> =
    null;

  // 1. Script "em vigor" via view org_scripts_current.
  //
  // Quando admin envia um v1.1 antes do owner aprovar, a org pode ter
  // SIMULTANEAMENTE:
  //   - v1.0 com effective_status='deprecated' (era active, mas existe newer)
  //   - v1.1 com effective_status='pending' (recém-enviado)
  //
  // O comportamento esperado: continuar avaliando contra o v1.0 ATÉ o owner
  // aprovar o v1.1. Pra isso, filtramos por effective_status ∈ ('active',
  // 'deprecated') — ambos significam "owner já aprovou em algum momento".
  // Status 'pending' (não-aprovado) e 'rejected' são excluídos.
  try {
    const supabase = createAdminClient();
    const { data: current } = await supabase
      .from("org_scripts_current")
      .select("script_id, effective_status")
      .eq("org_id", call.orgId)
      .is("ended_at", null)
      .in("effective_status", ["active", "deprecated"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (current?.script_id) {
      // orgId="" porque scripts podem ter org_id=null (templates globais).
      // A autorização org→script já foi feita pela linha org_scripts.
      script = await dbGetScriptById(current.script_id as string, "");
    }
  } catch (err) {
    console.warn("[ghl-scoring] active script lookup failed, falling back", {
      callId,
      orgId: call.orgId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Rubric default (sempre tenta — vira framework quando script existe,
  //    ou source primária quando não tem script).
  try {
    rubricData = await dbGetDefaultRubricWithCriteria(call.orgId);
  } catch (err) {
    console.warn("[ghl-scoring] rubric fetch failed", {
      callId,
      orgId: call.orgId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const rubricId = rubricData?.rubric.id ?? null;
  const systemPrompt =
    rubricData?.rubric.system_prompt ?? buildDefaultSystemPrompt();
  const llmModel = rubricData?.rubric.llm_model ?? null;

  const scoredItems: ScoredItem[] = (() => {
    // 1. Script.sections — owner aprovou, weights validados pela UI.
    if (script && script.sections.length > 0) {
      return script.sections.map((s) => ({
        name: s.name,
        description: [s.instructions, s.tips ? `Tip: ${s.tips}` : ""]
          .filter(Boolean)
          .join(" — "),
        weight: typeof s.weight === "number" ? s.weight : undefined,
        critical: Boolean(s.critical),
        source: "script" as const,
      }));
    }
    // 2. Rubric.criteria como scored (sem script ativo).
    const criteria = rubricData?.criteria ?? [];
    if (criteria.length > 0) {
      return criteria.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? "",
        weight:
          typeof (c as unknown as Record<string, unknown>)["weight"] ===
          "number"
            ? ((c as unknown as Record<string, unknown>)["weight"] as number)
            : undefined,
        critical: Boolean(
          (c as unknown as Record<string, unknown>)["is_critical"],
        ),
        source: "rubric" as const,
      }));
    }
    // 3. Último fallback: defaults genéricos.
    return DEFAULT_SECTIONS.map((s) => ({
      name: s.name,
      description: s.description,
      weight: undefined,
      critical: s.critical,
      source: "default" as const,
    }));
  })();

  // Framework = rubric.criteria quando script existe (rubric vira contexto).
  // Quando não tem script, sections JÁ são rubric.criteria — framework vazio
  // pra evitar duplicar no prompt.
  const framework = script
    ? (rubricData?.criteria.map((c) => ({
        name: c.name,
        description: c.description ?? "",
      })) ?? [])
    : [];

  let result: Awaited<ReturnType<typeof scoreTranscript>> | null = null;
  let intentBreakdown: IntentBreakdown | null = null;

  try {
    result = await scoreTranscript({
      transcript: call.transcript,
      scoredItems,
      framework,
      systemPrompt,
      llmModel,
      trainerName: call.trainer_name ?? undefined,
      clientName: call.client_name ?? undefined,
    });

    // Intent breakdown (4 signals: financial, urgency, authority, engagement).
    // Phase 3: IA retorna os scores durante scoring.
    if (result.intent) {
      // Use intent scores from main scoring (Phase 3)
      intentBreakdown = result.intent as IntentBreakdown;
    } else if (call.orgId) {
      // Fallback: call dedicated intent scoring (older phase or API update)
      const weights = getOrgIntentWeightsForScoring(call.orgId);
      const intentResult = await scoreIntentFromTranscript({
        transcript: call.transcript,
        trainerName: call.trainer_name ?? undefined,
        clientName: call.client_name ?? undefined,
        weights,
      });
      intentBreakdown = intentResult.breakdown as IntentBreakdown;
    }
  } catch (err) {
    console.error("[ghl-scoring] scoreTranscript failed", {
      callId,
      err: err instanceof Error ? err.message : String(err),
    });
    // Re-throw to fail the pipeline
    throw err;
  }

  // Validate result was populated
  if (!result) {
    throw new Error(`runGhlCallScoring: scoreTranscript returned empty for call ${callId}`)
  }

  await dbUpdateGhlCallPipeline(callId, {
    rubricId,
    scriptId: script?.id ?? null,
    overallScore: result.overallScore,
    detectedOutcome: result.detectedOutcome,
    // GHL pipeline não tem humano marcando outcome — espelha o detectado
    // pro campo que a UI lê (lib/services/calls.ts:107).
    callOutcome: result.detectedOutcome,
    summary: result.summary,
    strengths: result.strengths,
    improvements: result.improvements,
    sections: result.sections as unknown as Record<string, unknown>[],
    modelUsed: result.modelUsed,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    promptVersion: result.promptVersion,
    intentBreakdown,
  });

  if (call.trainer_id) {
    await syncTrainerStats(call.trainer_id);
  }

  // Telemetria de custo p/ COGS (best-effort). Mesmo surface 'analyze' do
  // /api/analyze — este é o caminho de scoring da pipeline GHL/chunked. 1
  // evento cobre o retry (tokens já somados em scoreTranscript).
  void recordLlmUsage({
    orgId: call.orgId ?? null,
    surface: "analyze",
    model: result.modelUsed,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsdOverride: result.costUsd,
    callId,
  })

  console.info("[ghl-scoring] scored call", {
    callId,
    orgId: call.orgId,
    scriptId: script?.id ?? null,
    rubricId,
    source: script ? "script" : rubricData ? "rubric" : "default",
    overallScore: result?.overallScore ?? null,
    detectedOutcome: result?.detectedOutcome ?? null,
    sectionsCount: result?.sections.length ?? 0,
    costUsd: result?.costUsd ?? 0,
  });
}
