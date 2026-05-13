import type { Insight, Trainer, Call, RubricScores } from "@/lib/types";
import { getCalls, avgRubricScores } from "@/lib/services/calls";
import { getGeminiModel } from "@/lib/gemini";
import { getOrgId } from "@/lib/auth";

export async function getInsights(): Promise<Insight[]> {
  // Always compute from real data
  const { dbGetTrainers } = await import("@/lib/db/trainers");
  const orgId = await getOrgId();
  const [trainers, calls] = await Promise.all([
    orgId ? dbGetTrainers({ orgId }) : Promise.resolve([]),
    orgId ? getCalls({ limit: 200, orgId }) : Promise.resolve([]),
  ]);

  if (trainers.length === 0 || calls.length === 0) {
    return [];
  }

  return buildInsightsFromData(trainers, calls);
}

// ─── Compute insights from real trainer + call data ─────────────────────────

function buildInsightsFromData(trainers: Trainer[], calls: Call[]): Insight[] {
  const insights: Insight[] = [];
  const sorted = [...trainers].sort((a, b) => b.score - a.score);
  const teamAvg = avgRubricScores(calls);

  // ── 1. Biggest rubric weakness (revenue leak) ─────────────────────────────
  const rubricKeys: { key: keyof RubricScores; label: string }[] = [
    { key: "discovery", label: "Discovery" },
    { key: "problemAgitation", label: "Problem Agitation" },
    { key: "offerPresentation", label: "Offer Presentation" },
    { key: "objectionHandling", label: "Objection Handling" },
    { key: "closeAndNextSteps", label: "Close & Next Steps" },
  ];

  const weakest = rubricKeys.reduce((prev, curr) =>
    teamAvg[curr.key] < teamAvg[prev.key] ? curr : prev,
  );

  // Compute per-trainer avg on weakest section from calls (0–5 scale)
  const trainerWeakestScores = new Map<
    string,
    { sum: number; count: number; name: string }
  >();
  for (const call of calls) {
    if (!call.trainerId) continue;
    if (!trainerWeakestScores.has(call.trainerId)) {
      trainerWeakestScores.set(call.trainerId, {
        sum: 0,
        count: 0,
        name: call.trainerName,
      });
    }
    const entry = trainerWeakestScores.get(call.trainerId)!;
    entry.sum += call.rubricScores[weakest.key];
    entry.count += 1;
  }

  let trainersBelow = 0;
  let bestOnWeakestName = sorted[0].name;
  let bestOnWeakestAvg = 0;
  for (const [, entry] of trainerWeakestScores) {
    const avg = entry.count > 0 ? entry.sum / entry.count : 0;
    if (avg < 3.5) trainersBelow++;
    if (avg > bestOnWeakestAvg) {
      bestOnWeakestAvg = avg;
      bestOnWeakestName = entry.name;
    }
  }

  // Compute close rate for calls with low vs high score on weakest section (0–5 scale)
  const callsWithLow = calls.filter((c) => c.rubricScores[weakest.key] < 3.5);
  const callsWithHigh = calls.filter((c) => c.rubricScores[weakest.key] >= 3.5);
  const closeRateLow =
    callsWithLow.length > 0
      ? Math.round(
          (callsWithLow.filter((c) => c.result === "closed").length /
            callsWithLow.length) *
            100,
        )
      : 0;
  const closeRateHigh =
    callsWithHigh.length > 0
      ? Math.round(
          (callsWithHigh.filter((c) => c.result === "closed").length /
            callsWithHigh.length) *
            100,
        )
      : 0;

  insights.push({
    id: "insight-revenue-leak",
    type: "risk",
    icon: "🚨",
    title: `${weakest.label} is the biggest revenue leak`,
    tag: "Team pattern",
    tagColor: "red",
    summary: `${trainersBelow} of ${sorted.length} sales people score below 3.5 on ${weakest.label}. Calls that skip this step close at ${closeRateLow}% vs. ${closeRateHigh}% when executed correctly.`,
    action: `30-min role-play focused on ${weakest.label.toLowerCase()}. Use ${bestOnWeakestName}'s calls as the benchmark.`,
  });

  // ── 2. At-risk trainer (biggest score drop OR lowest performer) ───────────
  const withDrop = sorted.filter((t) => t.scoreDelta < 0);
  const atRisk =
    withDrop.length > 0
      ? withDrop.reduce((worst, t) =>
          t.scoreDelta < worst.scoreDelta ? t : worst,
        )
      : sorted[sorted.length - 1]; // lowest overall score

  const atRiskCalls = calls.filter((c) => c.trainerId === atRisk.id);
  const atRiskClosed = atRiskCalls.filter((c) => c.result === "closed").length;
  const atRiskCloseRate =
    atRiskCalls.length > 0
      ? Math.round((atRiskClosed / atRiskCalls.length) * 100)
      : 0;

  if (atRisk.scoreDelta < 0) {
    insights.push({
      id: "insight-at-risk",
      type: "warning",
      icon: "⚠️",
      title: `${atRisk.name} is at risk of disengagement`,
      tag: "Sales person alert",
      tagColor: "amber",
      summary: `Score dropped ${Math.abs(atRisk.scoreDelta)}pts recently, ${atRisk.totalCalls} total calls, and close rate is at ${atRiskCloseRate}%. This is a coaching emergency, not a performance issue.`,
      action: `Schedule a 1:1 with ${atRisk.name}. Review the last 3 calls and identify where confidence dropped.`,
    });
  } else {
    insights.push({
      id: "insight-at-risk",
      type: "warning",
      icon: "⚠️",
      title: `${atRisk.name} needs coaching attention`,
      tag: "Sales person alert",
      tagColor: "amber",
      summary: `Lowest score on the team (${atRisk.score}), ${atRisk.totalCalls} total calls, close rate at ${atRiskCloseRate}%. Targeted coaching can close the gap.`,
      action: `Schedule a 1:1 with ${atRisk.name}. Review the last 3 calls and identify specific areas for improvement.`,
    });
  }

  // ── 3. Best practice from top performer ───────────────────────────────────
  const topTrainer = sorted[0];
  // Compute top trainer's rubric from their actual calls (0–5 scale)
  const topTrainerCalls = calls.filter((c) => c.trainerId === topTrainer.id);
  const topTrainerAvg = avgRubricScores(topTrainerCalls);

  const strongest = rubricKeys.reduce((prev, curr) =>
    topTrainerAvg[curr.key] > topTrainerAvg[prev.key] ? curr : prev,
  );
  const topScore = Math.round(topTrainerAvg[strongest.key] * 10) / 10;
  const teamAvgOnStrongest = Math.round(teamAvg[strongest.key] * 10) / 10;
  const delta = Math.round((topScore - teamAvgOnStrongest) * 10) / 10;

  insights.push({
    id: "insight-best-practice",
    type: "tip",
    icon: "💡",
    title: `${topTrainer.name}'s ${strongest.label} can elevate the whole team`,
    tag: "Best practices",
    tagColor: "blue",
    summary: `${topTrainer.name} scores ${topScore}/5 in ${strongest.label} — ${delta}pts above team average (${teamAvgOnStrongest}/5). This is a replicable pattern that the sales team can adopt.`,
    action: `Pull 2 clips from ${topTrainer.name}'s calls and share as training material at the next team meeting.`,
  });

  // ── 4. Coaching ROI signal ────────────────────────────────────────────────
  const avgClose =
    sorted.length > 0
      ? Math.round(sorted.reduce((s, t) => s + t.closeRate, 0) / sorted.length)
      : 0;

  // Find strongest improvement section (highest team avg)
  const strongestTeam = rubricKeys.reduce((prev, curr) =>
    teamAvg[curr.key] > teamAvg[prev.key] ? curr : prev,
  );

  insights.push({
    id: "insight-roi",
    type: "positive",
    icon: "📈",
    title: `Coaching working — team close rate at ${avgClose}%`,
    tag: "ROI signal",
    tagColor: "green",
    summary: `Current team close rate is ${avgClose}%. Strongest area: ${strongestTeam.label} (team avg ${Math.round(teamAvg[strongestTeam.key] * 10) / 10}/5).`,
    action:
      "Keep the cadence. Consider daily uploads for faster feedback loops.",
  });

  return insights;
}

export async function generateInsights(scriptId?: string) {
  // ── 1. Fetch recent calls from Supabase ──────────────────────────────────
  const orgId = await getOrgId();
  const calls = orgId ? await getCalls({ limit: 50, orgId }) : [];

  const closedCalls    = calls.filter((c) => c.result === "closed");
  const notClosedCalls = calls.filter((c) => c.result === "not_closed");
  const partialCalls   = calls.filter((c) => c.result === "partial");
  const noOutcomeCalls = calls.filter((c) => c.result === "no_outcome");
  const closeRate =
    calls.length > 0
      ? Math.round((closedCalls.length / calls.length) * 100)
      : 0;

  const metrics = {
    total: calls.length,
    closed: closedCalls.length,
    notClosed: notClosedCalls.length,
    partial: partialCalls.length,
    noOutcome: noOutcomeCalls.length,
    closeRate,
  };

  // ── 2. Build transcript summaries for Gemini ─────────────────────────────
  const callSummaries = calls
    .filter((c) => c.transcript)
    .slice(0, 20)
    .map(
      (c, i) =>
        `Call ${i + 1} [${c.result}] — Trainer: ${c.trainerName}, Score: ${c.score.toFixed(1)}/5\nTranscript excerpt: ${c.transcript?.slice(0, 500) ?? ""}`,
    )
    .join("\n\n---\n\n");

  // ── 3. Call Gemini ────────────────────────────────────────────────────────
  const prompt = `
You are an expert sales coach analysing a batch of dog training sales calls.
You have ${calls.length} calls: ${closedCalls.length} closed, ${partialCalls.length} partial (follow-up pending), ${notClosedCalls.length} not closed, ${noOutcomeCalls.length} with no clear outcome.
Close rate: ${closeRate}%.
${scriptId ? `Script ID being analysed: ${scriptId}` : ""}

${callSummaries ? `## Call data:\n${callSummaries}` : "No transcripts available — generate insights based on the outcome distribution."}

Analyse the patterns across these calls and return ONLY valid JSON (no markdown) with this exact structure:
{
  "successPatterns": ["<pattern observed in closed calls>", ...],
  "failurePatterns": ["<pattern observed in failed calls>", ...],
  "partialPatterns": ["<pattern observed in follow-up calls>", ...],
  "keyDifferences": ["<what separates closers from non-closers>", ...],
  "dos": ["<actionable do>", ...],
  "donts": ["<actionable don't>", ...],
  "commonObjections": [
    {
      "objection": "<objection text>",
      "frequency": "<Very Common|Common|Occasional>",
      "bestResponse": "<best way to handle it>",
      "worstResponse": "<worst way to handle it>"
    }
  ],
  "preCallChecklist": ["<checklist item>", ...],
  "suggestedScript": "<optimized script outline based on what worked, with numbered sections>"
}

Each array should have 4–8 items. Be specific and actionable — reference actual patterns from the calls when transcripts are available.
`.trim();

  const model = getGeminiModel();
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;

  let parsed: {
    successPatterns: string[];
    failurePatterns: string[];
    partialPatterns: string[];
    keyDifferences: string[];
    dos: string[];
    donts: string[];
    commonObjections: {
      objection: string;
      frequency: string;
      bestResponse: string;
      worstResponse: string;
    }[];
    preCallChecklist: string[];
    suggestedScript: string;
  };

  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error("[insights] Raw AI response:", text);
    throw new Error("Failed to parse AI response");
  }

  // ── 4. Fetch trainer list to include in response (used by send-insights) ─
  const trainers = [...new Set(calls.map((c) => c.trainerName))].map(
    (name) => ({ name, email: "" }),
  );

  return {
    metrics,
    ...parsed,
    trainers,
  };
}
