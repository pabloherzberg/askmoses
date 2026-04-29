import { type NextRequest } from "next/server";
import { generateText } from "ai";
import { getOpenAIModel } from "@/lib/openai";
import {
  dbGetDefaultRubricWithCriteria,
  dbGetRubricById,
  dbGetCriteriaByRubric,
} from "@/lib/db/rubric";
import { dbCreateCall } from "@/lib/db/calls";
import { syncTrainerStats } from "@/lib/db/trainers";
import { getSession, getOrgId, getTrainerDbId } from "@/lib/auth";

interface AnalyzeRequestBody {
  transcript: string;
  rubricId?: string;
  clientName?: string;
  trainerName?: string;
  trainerEmail?: string;
  trainerId?: string;
  scriptId?: string;
  callOutcome?: string;
}

export interface CriterionScore {
  criterionId: string;
  criterionName: string;
  score: number; // 0–5
  justification: string;
}

export interface SectionScore {
  name: string;
  score: number; // 0–5
  feedback: string;
  critical: boolean;
}

export interface AnalyzeResult {
  overallScore: number;
  detectedOutcome: "closed" | "no-close" | "follow-up";
  summary: string;
  strengths: string[];
  improvements: string[];
  criteriaScores: CriterionScore[];
  // structured sections for upload page UI and email
  sections: SectionScore[];
  criteria: SectionScore[]; // alias for backward compat
  transcript: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AnalyzeRequestBody;
    const { transcript, clientName, trainerName, trainerEmail } = body;

    // Resolve trainer_id: body.trainerId (owner uploading for a trainer) OR session trainer
    const session = await getSession();
    const sessionTrainerId =
      body.trainerId ?? (session ? await getTrainerDbId() : null);

    if (!transcript) {
      return Response.json(
        { error: "transcript is required" },
        { status: 400 },
      );
    }

    // ── 1. Fetch default rubric + criteria for the org ───────────────────────
    const orgId = await getOrgId();
    const rubricData =
      orgId && body.rubricId
        ? await resolveRubricForOrg(orgId, body.rubricId)
        : orgId
          ? await dbGetDefaultRubricWithCriteria(orgId)
          : null;

    const criteria = rubricData?.criteria ?? [];
    const rubricId = rubricData?.rubric.id ?? null;
    const systemPrompt =
      rubricData?.rubric.system_prompt ?? buildDefaultSystemPrompt();
    const llmModel = rubricData?.rubric.llm_model ?? null;

    const criteriaBlock =
      criteria.length > 0
        ? criteria
            .map(
              (c, i) =>
                `${i + 1}. **${c.name}**${c.description ? `: ${c.description}` : ""}`,
            )
            .join("\n")
        : buildDefaultCriteria();

    // ── 2. Build prompt and call Gemini ──────────────────────────────────────
    const userPrompt = `
${systemPrompt}

You are an expert sales coach. Your job is to give honest, calibrated feedback that helps salespeople improve. Scores must reflect actual execution — not just whether the deal closed. The outcome (closed, follow_up, etc.) affects the overallScore cap, but individual criterion scores reflect the quality of execution of that specific skill.

## Scoring philosophy — calibration baseline:
Use decimals in 0.5 increments (0, 0.5, 1.0 … 5.0).

START each criterion at 3.0 as the baseline for a real sales call that was reasonably attempted. Then adjust UP or DOWN based on specific evidence in the transcript.

- 5.0: Textbook — would use as a training example.
- 4.0–4.5: Strong. Solid with only minor gaps.
- 3.0–3.5: Adequate. Functional, room to improve.
- 2.0–2.5: Needs Work. Weak or incomplete execution.
- 1.0–1.5: Poor. Barely attempted or done incorrectly.
- 0–0.5: Absent. Not attempted at all.

**Calibration check**: A salesperson who reasonably executes all 5 phases should score 3.0–3.5 per criterion, giving ~60–70/100 overall before outcome caps. Closing a deal well should reach 75–90. A perfect call = 100. Do NOT default to 1.0–2.0 just because the deal did not close — the outcome cap handles that.

## Outcome-adjusted scoring (overallScore caps only):
These caps apply ONLY to the final overallScore calculation — never to individual criterion scores.
- "closed": max 100.
- "follow_up" with concrete date/time agreed: max 80.
- "follow_up" vague (no specific date/time): max 70.
- "objection_unresolved": max 60.
- "no_decision": max 50.

## Criterion-specific adjustments (only apply when the specific behaviour is clearly present):

### Close & Next Steps:
Evaluate whether the salesperson made a clear close attempt appropriate to the prospect's readiness, and whether a concrete next step was secured.
- outcome = "closed": floor 3.5 (deal closed = criterion was at minimum met)
- outcome = "follow_up" with specific date/time: floor 3.0
- outcome = "follow_up" vague: apply -1.0 (no date/time secured)
- outcome = "no_decision" or "objection_unresolved": cap 2.0
- No attempt to close or define a next step at all: cap 1.5
- Only passive language used ("let me know when you decide"): -1.0
- Urgency created naturally (availability, cost of delay): +0.5

### Discovery:
Evaluate quality and depth of needs assessment.
- Deep questioning with follow-ups (history, triggers, what was tried, urgency): +0.5 to +1.0
- No questions asked — jumped straight to pitch: cap 1.0
- Only 1–2 surface questions, no follow-up depth: cap 2.5
- Qualified budget, timeline, or decision-maker: +0.5

### Problem Agitation:
Evaluate whether the salesperson deepened the prospect's felt pain before presenting the solution.
- Used future pacing ("if nothing changes, where does this go?"): +0.5
- Reflected prospect's own words back to amplify pain: +0.5
- Jumped directly from discovery to pitch without amplifying pain: -1.0
- No emotional connection or cost-of-inaction established: cap 2.0

### Offer Presentation:
Evaluate clarity, personalisation, and value-first framing.
- Price presented after value was established: baseline or +0.5
- Price presented before establishing value: -1.0
- Offer personalised to the prospect's dog/situation: +0.5
- Clear transformation/outcome described: +0.5
- Price presented with zero framing or context: -0.5

### Objection Handling:
Evaluate how objections were received and addressed.
- Acknowledged objection with empathy before responding: +0.5
- Probed root cause ("is it mainly price, or something else?"): +0.5
- Objection left completely unaddressed (changed subject or ended call): -1.0 per objection
- Agreed with objection and disengaged without redirecting: -1.5
- No objections arose in the call: score based on overall readiness to handle them (use 3.0 as default)

## Evaluation criteria:
${criteriaBlock}

## Call information:
- Trainer: ${trainerName ?? "not provided"}
- Prospect/Client: ${clientName ?? "not provided"}
- Reported outcome: ${body.callOutcome ?? "not provided"}

## Transcript:
${transcript}

## Response instructions:
Score each criterion on a scale of 0 to 5 using 0.5 increments. Apply the scoring philosophy above — do not inflate scores. Use the decimal precision: a 2.5 is not a 3.
The overallScore is the average of all criteria scores multiplied by 20, then capped according to the outcome rules above.

For improvements: be specific and actionable. Each improvement must be a single string that covers:
what went wrong → what to say/do instead → why it moves the deal forward.
Example: "You accepted 'I need to think about it' without probing — ask 'What specifically do you need to think through?' to surface the real objection and keep the conversation alive."

For strengths: only list genuine strengths — things that were clearly well executed.

Reply ONLY with valid JSON, no markdown, following this exact format:
{
  "detectedOutcome": "<closed|follow_up|objection_unresolved|no_decision>",
  "summary": "<honest assessment in 2-3 sentences — name the biggest reason the deal did or did not close>",
  "strengths": ["<specific strength with context>", "..."],
  "improvements": ["<single string: what went wrong → what to do instead → why it matters>", "..."],
  "criteriaScores": [
    {
      "criterionId": "<criterion id or name>",
      "criterionName": "<name>",
      "score": <0-5>,
      "justification": "<honest justification — reference specific moments in the call>"
    }
  ]
}
`.trim();

    const { text: rawText } = await generateText({
      model: getOpenAIModel(llmModel),
      prompt: userPrompt,
    });
    const text = rawText.trim();

    // Strip markdown code fences and find the JSON object
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    // Extract first {...} block in case there's surrounding text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;

    let parsed: {
      detectedOutcome: string;
      summary: string;
      strengths: string[];
      improvements: string[];
      criteriaScores: CriterionScore[];
    };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[analyze] Raw AI response:", text);
      return Response.json(
        { error: "Failed to parse AI response", raw: text },
        { status: 500 },
      );
    }

    // ── 3. Normalise strengths/improvements — flatten objects/JSON into strings
    const flattenItem = (item: unknown): string => {
      // Already a plain string — try to parse in case Gemini serialized an object as JSON string
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (trimmed.startsWith("{")) {
          try {
            const obj = JSON.parse(trimmed) as Record<string, unknown>;
            item = obj; // fall through to object handling below
          } catch {
            // not valid JSON, use as-is
            return trimmed.replace(/\*\*/g, "");
          }
        } else {
          return trimmed.replace(/\*\*/g, "");
        }
      }
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        // Prefer known keys in logical order, fall back to all values
        const ordered = [
          "what happened",
          "what to do instead",
          "why it matters",
        ];
        const parts = ordered.filter((k) => obj[k]).map((k) => String(obj[k]));
        return (
          parts.length > 0 ? parts.join(" → ") : Object.values(obj).join(" → ")
        ).replace(/\*\*/g, "");
      }
      return String(item).replace(/\*\*/g, "");
    };
    parsed.strengths = (parsed.strengths ?? []).map(flattenItem);
    parsed.improvements = (parsed.improvements ?? []).map(flattenItem);

    // ── 4. Compute overallScore: average of criteria × 20, capped by outcome ─
    const scores = parsed.criteriaScores.map((c) => c.score);
    const avg =
      scores.length > 0
        ? scores.reduce((sum, s) => sum + s, 0) / scores.length
        : 0;
    const rawScore = Math.round(avg * 20);
    const outcomeCap: Record<string, number> = {
      closed: 100,
      follow_up: 80,
      objection_unresolved: 60,
      no_decision: 50,
    };
    const reportedOutcome =
      body.callOutcome ??
      parsed.detectedOutcome?.toLowerCase() ??
      "no_decision";
    const cap = outcomeCap[reportedOutcome] ?? 75;
    const overallScore = Math.min(rawScore, cap);

    // ── 4. Normalise detectedOutcome to DB-allowed values ───────────────────
    const VALID_OUTCOMES = [
      "closed",
      "follow_up",
      "objection_unresolved",
      "no_decision",
    ] as const;
    type ValidOutcome = (typeof VALID_OUTCOMES)[number];
    const outcomeAliases: Record<string, ValidOutcome> = {
      "no-close": "no_decision",
      no_close: "no_decision",
      "follow-up": "follow_up",
    };
    const rawOutcome = parsed.detectedOutcome?.toLowerCase?.() ?? "";
    const detectedOutcome: ValidOutcome = VALID_OUTCOMES.includes(
      rawOutcome as ValidOutcome,
    )
      ? (rawOutcome as ValidOutcome)
      : (outcomeAliases[rawOutcome] ?? "no_decision");

    // ── 5. Save call to Supabase ────────────────────────────────────────────
    const savedCall = await dbCreateCall({
      orgId: orgId ?? undefined,
      rubricId: rubricId ?? undefined,
      trainerId: sessionTrainerId ?? undefined,
      trainerName: trainerName ?? "Unknown",
      trainerEmail: trainerEmail ?? undefined,
      transcript,
      overallScore,
      totalCriteria: parsed.criteriaScores.length,
      criteria: parsed.criteriaScores as unknown as Record<string, unknown>,
      summary: parsed.summary,
      strengths: parsed.strengths,
      improvements: parsed.improvements,
      callOutcome: body.callOutcome ?? detectedOutcome,
      clientName: clientName ?? undefined,
      detectedOutcome,
    });

    // ── 6. Sync trainer stats (fire-and-forget) ─────────────────────────────
    if (sessionTrainerId) {
      syncTrainerStats(sessionTrainerId).catch((e) =>
        console.error("[analyze] syncTrainerStats failed:", e),
      );
    }

    // ── 7. Normalise criteriaScores into SectionScore[] ─────────────────────
    // Sections marked critical if they match the default critical section names.
    // When Task 1.8 ships, this list will come from the rubric definition instead.
    const criticalSectionNames = new Set(
      (rubricData?.criteria ?? [])
        .filter((c) => (c as unknown as Record<string, unknown>)["is_critical"])
        .map((c) => c.name.toLowerCase())
    );
    // Fallback: Discovery and Problem Agitation are always critical
    if (criticalSectionNames.size === 0) {
      criticalSectionNames.add("discovery");
      criticalSectionNames.add("problem agitation");
    }

    const normalisedSections: SectionScore[] = parsed.criteriaScores.map((c) => {
      const name =
        c.criterionName ??
        (c as unknown as Record<string, unknown>)["name"] ??
        "";
      const feedback =
        c.justification ??
        (c as unknown as Record<string, unknown>)["feedback"] ??
        "";
      return {
        name,
        score: c.score,
        feedback,
        critical: criticalSectionNames.has(name.toLowerCase()),
      };
    });

    return Response.json({
      id: savedCall.id,
      overallScore,
      detectedOutcome,
      summary: parsed.summary,
      strengths: parsed.strengths,
      improvements: parsed.improvements,
      criteriaScores: parsed.criteriaScores,
      criteria: normalisedSections,
      sections: normalisedSections,
      transcript,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[analyze] Error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

async function resolveRubricForOrg(orgId: string, rubricId: string) {
  const rubric = await dbGetRubricById(orgId, rubricId);
  if (!rubric) return dbGetDefaultRubricWithCriteria(orgId);

  const criteria = await dbGetCriteriaByRubric(rubric.id);
  return { rubric, criteria };
}

function buildDefaultSystemPrompt(): string {
  return `You are a senior sales coach specialising in dog training businesses.
Your mission is to help salespeople close more deals by giving them honest, specific, and actionable feedback.
You do not give participation trophies. A score reflects real performance — if the deal did not close, the score must reflect that reality.`;
}

function buildDefaultCriteria(): string {
  return `1. **Discovery**: Identifying the prospect's needs and problems
2. **Problem Agitation**: Deepening urgency around identified problems
3. **Offer Presentation**: Clarity and fit of the service presentation
4. **Objection Handling**: Quality of objection responses
5. **Close & Next Steps**: Effectiveness of closing or defining next steps`;
}
