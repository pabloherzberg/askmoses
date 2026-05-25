import type { Trainer, PerformanceTrendPoint, TrendPoint, CallsByTrainerMap } from "@/lib/types";
import type { BehavioralDimension, CoachingRec, BehavioralTrendDimension, TeamHealthEntry } from "@/lib/mock-data";

const USE_MOCK = process.env.USE_MOCK_DATA !== "false";
import { getOrgId } from "@/lib/auth";

export async function getTrainers(): Promise<Trainer[]> {
  const { dbGetTrainers } = await import("@/lib/db/trainers");
  const orgId = await getOrgId();
  return orgId ? dbGetTrainers({ orgId }) : [];
}

export async function getTrainerById(id: string): Promise<Trainer | null> {
  const { dbGetTrainerById } = await import("@/lib/db/trainers");
  return dbGetTrainerById(id);
}

export async function getTrainersWithMockData(): Promise<Trainer[]> {
  if (USE_MOCK) {
    const { trainers } = await import("@/lib/mock-data");
    return trainers;
  }
  return getTrainers();
}

export async function getBestAndWorstCalls(): Promise<{ bestCalls: CallsByTrainerMap; worstCalls: CallsByTrainerMap }> {
  const { bestCalls, worstCalls } = await import("@/lib/mock-data");
  return { bestCalls, worstCalls };
}

export async function getBehavioralProfile(trainerKey: string): Promise<BehavioralDimension[]> {
  const { trainerBehavioral } = await import("@/lib/mock-data");
  return trainerBehavioral[trainerKey] ?? [];
}

export async function getCoachingRecs(trainerKey: string): Promise<CoachingRec[]> {
  const { coachingRecs } = await import("@/lib/mock-data");
  return coachingRecs[trainerKey] ?? [];
}

export async function getBehavioralTrends(trainerKey: string): Promise<BehavioralTrendDimension[]> {
  const { trainerTrends } = await import("@/lib/mock-data");
  return trainerTrends[trainerKey] ?? [];
}

// Saúde do time derivada de dados reais: stats já agregadas em `trainers`
// (close_rate, score_delta) + data da última call por trainer para o status
// de atividade (active hoje · recent ≤7d · away).
export async function getTeamHealth(): Promise<TeamHealthEntry[]> {
  const orgId = await getOrgId();
  if (!orgId) return [];

  const { dbGetTrainers } = await import("@/lib/db/trainers");
  const { getCalls } = await import("@/lib/services/calls");
  const { getTranslations } = await import("next-intl/server");
  const [trainers, calls, t] = await Promise.all([
    dbGetTrainers({ orgId }),
    getCalls({ limit: 200, orgId }),
    getTranslations("Owner.teamHealth"),
  ]);

  // Última call por trainer — base para o status de atividade.
  const lastCallMs = new Map<string, number>();
  for (const c of calls) {
    if (!c.trainerId) continue;
    const ms = new Date(c.date).getTime();
    if (Number.isFinite(ms) && ms > (lastCallMs.get(c.trainerId) ?? 0)) {
      lastCallMs.set(c.trainerId, ms);
    }
  }

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  return trainers.map((tr) => {
    const last = lastCallMs.get(tr.id);
    const days = last != null ? Math.floor((now - last) / DAY) : null;
    const statusType: TeamHealthEntry["statusType"] =
      days == null ? "away" : days <= 1 ? "active" : days <= 7 ? "recent" : "away";
    const status =
      days == null
        ? t("statusNoActivity")
        : days === 0
          ? t("statusActiveToday")
          : days === 1
            ? t("statusYesterday")
            : t("statusDaysAgo", { days });
    return {
      initials: tr.avatar,
      name: tr.name,
      avatarColor: tr.avatarColor,
      calls: tr.totalCalls,
      status,
      statusType,
      closeRate: tr.closeRate,
      delta: tr.scoreDelta,
      trend: tr.scoreDelta >= 0 ? "up" : "down",
    };
  });
}

// Tendências semanais de close rate, calculadas das calls reais via
// buildWeeklyTrend (6 semanas). Inclui a curva "team" + uma por trainer.
export async function getPerformanceTrends(
  realTrainers: { id: string; email?: string }[]
): Promise<Record<string, PerformanceTrendPoint[]>> {
  const orgId = await getOrgId();
  if (!orgId) return {};

  const { getCalls } = await import("@/lib/services/calls");
  const { buildWeeklyTrend, weeksSpanned } = await import("@/lib/services/rubric");
  const calls = await getCalls({ limit: 200, orgId });

  // Janela do gráfico = nº de semanas que as calls da org realmente cobrem
  // (1–6) — a MESMA para o time e para cada trainer, pra os pontos alinharem
  // por índice. Semanas sem call DENTRO da janela viram null (lacuna).
  const n = weeksSpanned(calls, 6);
  const toPoints = (tp: TrendPoint[]): PerformanceTrendPoint[] =>
    tp.map((p) => ({
      week: p.week,
      closeRate: p.score > 0 ? p.closeRate : null,
      avgScore: p.score > 0 ? p.score : null,
    }));

  const result: Record<string, PerformanceTrendPoint[]> = {
    team: toPoints(buildWeeklyTrend(calls, n)),
  };

  for (const tr of realTrainers) {
    const trainerCalls = calls.filter((c) => c.trainerId === tr.id);
    if (trainerCalls.length > 0) {
      result[tr.id] = toPoints(buildWeeklyTrend(trainerCalls, n));
    }
  }

  return result;
}
