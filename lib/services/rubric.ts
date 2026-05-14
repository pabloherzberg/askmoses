import {
  dbGetDefaultRubric,
  dbGetDefaultRubricWithCriteria,
  dbUpdateRubric,
  dbCreateCriterion,
  dbUpdateCriterion,
  dbDeleteCriterion,
  dbBulkReplaceCriteria,
} from "@/lib/db/rubric";
import type {
  UpdateRubricInput,
  CreateCriterionInput,
  UpdateCriterionInput,
  DbRubric,
  DbCriterion,
} from "@/lib/db/rubric";
import { getOrgId } from "@/lib/auth";
import { getCalls, avgRubricScores } from "@/lib/services/calls";
import type {
  RubricSection,
  RubricScores,
  TrendPoint,
  RevenueEstimatorItem,
  CorrelationFactor,
  CorrelationLevel,
} from "@/lib/types";

const CRITERION_KEY_MAP: Record<string, keyof RubricScores> = {
  discovery: "discovery",
  "problem agitation": "problemAgitation",
  "offer presentation": "offerPresentation",
  "objection handling": "objectionHandling",
  "close & next steps": "closeAndNextSteps",
  "close and next steps": "closeAndNextSteps",
};

const SECTION_COLORS: RubricSection["color"][] = [
  "blue",
  "accent2",
  "green",
  "amber",
  "red",
];

export interface TrainerSectionScore {
  trainerId: string;
  trainerName: string;
  scores: Record<string, number>; // criterionName → avg score 0–5
}

// ─── Trend computation ───────────────────────────────────────────────────────

function buildWeeklyTrend(
  calls: { date: string; score: number; result: string }[],
  weeks: number,
): TrendPoint[] {
  if (calls.length === 0) return [];

  const now = new Date();
  // Start of current week (Monday)
  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  currentMonday.setHours(0, 0, 0, 0);

  const trend: TrendPoint[] = [];

  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = new Date(currentMonday);
    weekStart.setDate(weekStart.getDate() - w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekCalls = calls.filter((c) => {
      const d = new Date(c.date);
      return d >= weekStart && d < weekEnd;
    });

    const label = `W${weeks - w}`;

    if (weekCalls.length === 0) {
      trend.push({ week: label, closeRate: 0, score: 0 });
      continue;
    }

    const closed = weekCalls.filter((c) => c.result === "closed").length;
    const closeRate = Math.round((closed / weekCalls.length) * 100);
    const avgScore = Math.round(
      weekCalls.reduce((s, c) => s + c.score, 0) / weekCalls.length,
    );

    trend.push({ week: label, closeRate, score: avgScore });
  }

  return trend;
}

export async function getRubric(): Promise<{
  sections: RubricSection[];
  trend: TrendPoint[];
  trainerSectionScores: TrainerSectionScore[];
}> {
  const orgId = await getOrgId();
  if (!orgId) {
    console.warn('[getRubric] getOrgId() returned null — user has no active org. Returning empty rubric.')
    return { sections: [], trend: [], trainerSectionScores: [] };
  }
  const [result, calls] = await Promise.all([
    dbGetDefaultRubricWithCriteria(orgId),
    getCalls({ limit: 200, orgId }),
  ]);

  if (!result) {
    console.warn(`[getRubric] No default rubric found for org=${orgId}. Check rubrics table: is_default=true, is_active=true, org_id set.`)
    return { sections: [], trend: [], trainerSectionScores: [] };
  }

  // ── Team averages ─────────────────────────────────────────────────────────
  const teamAvg = avgRubricScores(calls); // 0–5 scale

  // ── Per-trainer averages ──────────────────────────────────────────────────
  const trainerCallsMap = new Map<string, typeof calls>();
  for (const call of calls) {
    if (!call.trainerId) continue;
    if (!trainerCallsMap.has(call.trainerId))
      trainerCallsMap.set(call.trainerId, []);
    trainerCallsMap.get(call.trainerId)!.push(call);
  }

  const trainerSectionScores: TrainerSectionScore[] = [];
  for (const [trainerId, trainerCalls] of trainerCallsMap.entries()) {
    const avg = avgRubricScores(trainerCalls);
    const scores: Record<string, number> = {};
    for (const c of result.criteria) {
      const key = CRITERION_KEY_MAP[c.name.toLowerCase()];
      scores[c.name] = key ? Math.round(avg[key] * 10) / 10 : 0;
    }
    trainerSectionScores.push({
      trainerId,
      trainerName: trainerCalls[0].trainerName,
      scores,
    });
  }

  // ── Sections ──────────────────────────────────────────────────────────────
  const sections: RubricSection[] = result.criteria.map((c, i) => {
    const key = CRITERION_KEY_MAP[c.name.toLowerCase()];
    return {
      id: (key ?? c.id) as RubricSection["id"],
      name: c.name,
      weight: 1,
      isCritical: false,
      description: c.description ?? "",
      teamAvg: key ? Math.round(teamAvg[key] * 10) / 10 : 0,
      color: SECTION_COLORS[i % SECTION_COLORS.length],
      trainerScores: { marcus: 0, jamie: 0, jordan: 0, taylor: 0 },
    };
  });

  // ── 6-week trend ──────────────────────────────────────────────────────────
  const trend = buildWeeklyTrend(calls, 6);

  return { sections, trend, trainerSectionScores };
}

// Deriva o "nível" exibido nas colunas Corr./Impact a partir do score médio
// do critério na rubrica. Enquanto não há volume para correlação estatística
// real (ver disclaimer no CorrelationEngine), as badges refletem apenas a
// força do score — não uma correlação validada.
function levelFromScore(score: number): CorrelationLevel {
  if (score >= 4) return 'High'
  if (score >= 3) return 'Med'
  return 'Low'
}

export function buildCoachingDrivers(sections: RubricSection[]): CorrelationFactor[] {
  return sections.map((s) => {
    const level = levelFromScore(s.teamAvg)
    return {
      label: s.name,
      score: s.teamAvg,
      correlation: level,
      impact: level,
      source: 'Rubric',
    }
  })
}

export async function getCoachingDrivers(): Promise<CorrelationFactor[]> {
  const { sections } = await getRubric()
  return buildCoachingDrivers(sections)
}

export async function getRevenueEstimator(): Promise<{
  items: RevenueEstimatorItem[];
  total: number;
}> {
  const { revenueEstimator, revenueEstimatorTotal } = await import("@/lib/mock-data");
  return { items: revenueEstimator, total: revenueEstimatorTotal };
}

export async function getRubricConfig() {
  const orgId = await getOrgId();
  if (!orgId) return null;
  return dbGetDefaultRubricWithCriteria(orgId);
}

// ─── Write operations ────────────────────────────────────────────────────────

export async function updateRubricConfig(
  input: UpdateRubricInput,
): Promise<DbRubric> {
  const orgId = await getOrgId();
  if (!orgId) throw new Error("No org in session");
  const rubric = await dbGetDefaultRubric(orgId);
  if (!rubric) throw new Error("No default rubric found for org");
  return dbUpdateRubric(rubric.id, input);
}

export async function createCriterion(
  input: Omit<CreateCriterionInput, "rubricId">,
): Promise<DbCriterion> {
  const orgId = await getOrgId();
  if (!orgId) throw new Error("No org in session");
  const rubric = await dbGetDefaultRubric(orgId);
  if (!rubric) throw new Error("No default rubric found for org");
  return dbCreateCriterion({ ...input, rubricId: rubric.id });
}

export async function updateCriterion(
  id: string,
  input: UpdateCriterionInput,
): Promise<DbCriterion> {
  return dbUpdateCriterion(id, input);
}

export async function deleteCriterion(id: string): Promise<void> {
  return dbDeleteCriterion(id);
}

export async function bulkReplaceCriteria(
  criteria: Omit<CreateCriterionInput, "rubricId">[],
): Promise<DbCriterion[]> {
  const orgId = await getOrgId();
  if (!orgId) throw new Error("No org in session");
  const rubric = await dbGetDefaultRubric(orgId);
  if (!rubric) throw new Error("No default rubric found for org");
  return dbBulkReplaceCriteria(rubric.id, criteria);
}
