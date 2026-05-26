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

export async function getTrainerProfile(trainerId: string): Promise<{ name: string; email?: string } | null> {
  const trainer = await getTrainerById(trainerId);
  if (!trainer) return null;
  return { name: trainer.name, email: trainer.email };
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
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { getTranslations } = await import("next-intl/server");

  // Projeção mínima (trainer_id + created_at) e sem `limit` — em orgs grandes
  // o limit de 200 escondia calls antigas e fazia trainers com histórico
  // aparecerem como "Sem chamadas ainda". Mesmo em orgs com milhares de calls
  // o payload é pequeno (2 colunas).
  const supabase = createAdminClient();
  const [trainers, lastCalls, t] = await Promise.all([
    dbGetTrainers({ orgId }),
    supabase
      .from("calls")
      .select("trainer_id, created_at")
      .eq("org_id", orgId)
      .not("trainer_id", "is", null)
      .order("created_at", { ascending: false }),
    getTranslations("Owner.teamHealth"),
  ]);

  // Última call por trainer — primeira linha por trainer_id na lista já
  // ordenada desc é a mais recente.
  const lastCallMs = new Map<string, number>();
  for (const row of lastCalls.data ?? []) {
    const tid = row.trainer_id as string | null;
    if (!tid || lastCallMs.has(tid)) continue;
    const ms = new Date(row.created_at as string).getTime();
    if (Number.isFinite(ms)) lastCallMs.set(tid, ms);
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

// Tendências de close rate / score do trainer e do time, calculadas das
// calls reais. Dois modos:
//
//   - Weekly (default): buildWeeklyTrend gera 1 ponto por semana. Quando o
//     trainer cobre ≥2 semanas de calls, é o que faz sentido — comparação
//     temporal alinha com a janela do time.
//
//   - Per-call (fallback p/ esparso): trainer com calls só em 1 semana
//     resulta em 1 ponto solto no AreaChart (Recharts não desenha linha
//     com 1 ponto). Nesses casos cada call vira um ponto na X-axis com
//     close rate e score CUMULATIVOS. Mostra progressão real mesmo com
//     2-3 calls. Team avg é reconstruído per-call (cumulativo até cada
//     timestamp) pra alinhar.
//
// Aceita `calls` pré-carregadas — quando o caller já fez o getCalls (ex.:
// rota /api/coaching), evita disparar uma 2ª query duplicada pro Supabase.
export async function getPerformanceTrends(
  realTrainers: { id: string; email?: string }[],
  preloadedCalls?: import("@/lib/types").Call[],
): Promise<Record<string, PerformanceTrendPoint[]>> {
  const { buildWeeklyTrend, buildPerCallTrend, weeksSpanned } = await import(
    "@/lib/services/rubric"
  );

  let calls = preloadedCalls;
  if (!calls) {
    const orgId = await getOrgId();
    if (!orgId) return {};
    const { getCalls } = await import("@/lib/services/calls");
    calls = await getCalls({ limit: 200, orgId });
  }

  // Janela do gráfico em modo weekly = nº de semanas que as calls da org
  // realmente cobrem (1–6). Semanas sem call viram null (lacuna).
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
    if (trainerCalls.length === 0) continue;

    const span = weeksSpanned(trainerCalls, 6);
    if (span <= 1 && trainerCalls.length >= 2) {
      // Esparso: per-call cumulativo. Team é reconstruído pra alinhar
      // (mesmas labels C1, C2, ... → merge por índice no chart funciona).
      const { trainer: trainerPoints, team: teamPoints } = buildPerCallTrend(
        trainerCalls,
        calls,
      );
      result[tr.id] = toPoints(trainerPoints);
      // Override do team avg APENAS pra essa visualização — o key `team`
      // global continua weekly pra outros consumidores. Cliente seleciona
      // `result[tr.id].team` por trainer (ver patch no PerformanceTrend).
      result[`${tr.id}__team`] = toPoints(teamPoints);
    } else {
      result[tr.id] = toPoints(buildWeeklyTrend(trainerCalls, n));
    }
  }

  return result;
}
