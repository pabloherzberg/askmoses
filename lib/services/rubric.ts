import {
  dbGetDefaultRubric,
  dbGetDefaultRubricWithCriteria,
  dbGetRubrics,
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
import { toCorrelationLevel } from "@/lib/score-display";
import type {
  RubricSection,
  RubricScores,
  TrendPoint,
  RevenueEstimatorItem,
  CorrelationFactor,
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
  scores: Record<string, number>; // criterionName → avg score 0–100
}

// ─── Trend computation ───────────────────────────────────────────────────────

export function buildWeeklyTrend(
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

// ─── Per-call trend (fallback p/ dados esparsos) ─────────────────────────────
// Quando todas as calls do trainer caem na mesma semana, buildWeeklyTrend
// gera 1 só ponto e o Recharts AreaChart fica com um dot solto (não tem como
// desenhar linha com 1 ponto). Aqui cada call vira um ponto da X-axis com
// closeRate/score CUMULATIVOS — assim 2 calls já mostram uma tendência real
// (closed=2/2=100%, depois closed=2/3=67%, etc).
//
// O label é prefixado com "C" pra o tradutor de eixos (PerformanceTrend.tsx
// labelWeek) tratar como label de call e não confundir com "W"/Week.
export function buildPerCallTrend(
  calls: { date: string; score: number; result: string }[],
  teamCalls?: { date: string; score: number; result: string }[],
): { trainer: TrendPoint[]; team: TrendPoint[] } {
  if (calls.length === 0) return { trainer: [], team: [] };

  // Preserve timestamps em vez de recriar Date repetidas vezes.
  const sortedTrainer = [...calls]
    .map((c) => ({ ...c, _ts: new Date(c.date).getTime() }))
    .sort((a, b) => a._ts - b._ts);

  // ─── Trainer: single-pass running totals ──────────────────────────────
  const trainerTrend: TrendPoint[] = [];
  let tClosed = 0;
  let tScoreSum = 0;
  for (let i = 0; i < sortedTrainer.length; i++) {
    const c = sortedTrainer[i];
    if (c.result === "closed") tClosed += 1;
    tScoreSum += c.score;
    const n = i + 1;
    trainerTrend.push({
      week: `C${n}`,
      closeRate: Math.round((tClosed / n) * 100),
      score: Math.round(tScoreSum / n),
    });
  }

  // ─── Team: pointer-based cumulative ───────────────────────────────────
  // Team avg em cada ponto do trainer = cumulativo do time até o timestamp
  // dessa call (inclusive). Antes era O(N×M) — pra cada call do trainer,
  // varríamos teamCalls inteiro. Agora ordenamos team uma vez (M log M) e
  // usamos um ponteiro `p` que só avança (total amortizado O(N + M)).
  let teamTrend: TrendPoint[] = [];
  if (teamCalls && teamCalls.length > 0) {
    const sortedTeam = [...teamCalls]
      .map((tc) => ({ ...tc, _ts: new Date(tc.date).getTime() }))
      .sort((a, b) => a._ts - b._ts);

    let p = 0;
    let teamClosed = 0;
    let teamScoreSum = 0;

    teamTrend = sortedTrainer.map((c, i) => {
      while (p < sortedTeam.length && sortedTeam[p]._ts <= c._ts) {
        if (sortedTeam[p].result === "closed") teamClosed += 1;
        teamScoreSum += sortedTeam[p].score;
        p += 1;
      }
      const n = i + 1;
      if (p === 0) {
        return { week: `C${n}`, closeRate: 0, score: 0 };
      }
      return {
        week: `C${n}`,
        closeRate: Math.round((teamClosed / p) * 100),
        score: Math.round(teamScoreSum / p),
      };
    });
  }

  return { trainer: trainerTrend, team: teamTrend };
}

// Quantas semanas (1–maxWeeks) a janela do gráfico deve ter, com base no
// período real coberto pelas calls — evita semanas vazias "fantasma" no início
// do gráfico quando a org tem menos de maxWeeks semanas de dados.
export function weeksSpanned(
  calls: { date: string }[],
  maxWeeks: number,
): number {
  if (calls.length === 0) return 0;
  const mondayOf = (d: Date): number => {
    const m = new Date(d);
    m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    m.setHours(0, 0, 0, 0);
    return m.getTime();
  };
  const currentMonday = mondayOf(new Date());
  let oldest = Number.POSITIVE_INFINITY;
  for (const c of calls) {
    const t = new Date(c.date).getTime();
    if (Number.isFinite(t) && t < oldest) oldest = t;
  }
  if (!Number.isFinite(oldest)) return Math.min(maxWeeks, 1);
  const span =
    Math.round(
      (currentMonday - mondayOf(new Date(oldest))) / (7 * 24 * 60 * 60 * 1000),
    ) + 1;
  return Math.max(1, Math.min(maxWeeks, span));
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
  const [defaultRubric, calls] = await Promise.all([
    dbGetDefaultRubricWithCriteria(orgId),
    getCalls({ limit: 200, orgId }),
  ]);

  // Trend é puro stats de calls — não depende da rubric existir localmente.
  // Pré-fix, faltar rubric default zerava o gráfico do time mesmo com calls
  // analisadas (orgs novas só têm rubric via org_scripts → script.rubric_id,
  // sem default local). Computa SEMPRE.
  const trend = buildWeeklyTrend(calls, weeksSpanned(calls, 6));

  // Fallback da rubric: default local → rubric do script ativo via org_scripts
  // → rubric global. Garante que sections/trainerSectionScores tenham
  // conteúdo mesmo pra orgs criadas com script template.
  let result = defaultRubric;
  if (!result) {
    const { dbGetActiveOrgScript } = await import('@/lib/db/scripts');
    const activeScript = await dbGetActiveOrgScript(orgId);
    if (activeScript) {
      const { dbGetRubricById, dbGetCriteriaByRubric } = await import('@/lib/db/rubric');
      const rubric =
        (await dbGetRubricById(orgId, activeScript.rubric_id)) ??
        (await dbGetRubricById(null, activeScript.rubric_id));
      if (rubric) {
        const criteria = await dbGetCriteriaByRubric(rubric.id);
        result = { rubric, criteria };
      }
    }
  }
  if (!result) {
    console.warn(`[getRubric] No rubric resolvable for org=${orgId} (no local default, no active org_script with rubric). Returning trend-only.`);
    return { sections: [], trend, trainerSectionScores: [] };
  }

  // ── Team averages ─────────────────────────────────────────────────────────
  const teamAvg = avgRubricScores(calls); // 0–100 scale

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

  return { sections, trend, trainerSectionScores };
}

// Deriva o "nível" exibido nas colunas Corr./Impact a partir do score médio
// do critério na rubrica. Enquanto não há volume para correlação estatística
// real (ver disclaimer no CorrelationEngine), as badges refletem apenas a
// força do score — não uma correlação validada.
export function buildCoachingDrivers(sections: RubricSection[]): CorrelationFactor[] {
  return sections.map((s) => {
    const level = toCorrelationLevel(s.teamAvg)
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
  const orgId = await getOrgId(); // null → admin sem org → rubric global
  return dbGetDefaultRubricWithCriteria(orgId);
}

export async function listRubrics() {
  const orgId = await getOrgId();
  return dbGetRubrics(orgId);
}

// ─── Write operations ────────────────────────────────────────────────────────

export async function updateRubricConfig(
  input: UpdateRubricInput,
): Promise<DbRubric> {
  const orgId = await getOrgId(); // null → admin → rubric global
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
