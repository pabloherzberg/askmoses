export const dynamic = 'force-dynamic'

import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getCalls, avgRubricScores } from "@/lib/services/calls";
import { getPerformanceTrends, getTrainerProfile } from "@/lib/services/trainers";
import { RubricBar } from "@/components/shared/RubricBar";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { PerformanceTrend } from "@/components/shared/PerformanceTrend";
import { TrainerKpiStrip, type WeeklyBucket } from "./TrainerKpiStrip";
import { getSession, getTrainerDbId } from "@/lib/auth";
import type { RubricColor, RubricScores } from "@/lib/types";

const RUBRIC_SECTIONS: { key: keyof RubricScores; labelKey: string; color: RubricColor }[] = [
  { key: "discovery",         labelKey: "discovery",         color: "blue" },
  { key: "problemAgitation",  labelKey: "problemAgitation",  color: "amber" },
  { key: "offerPresentation", labelKey: "offerPresentation", color: "green" },
  { key: "objectionHandling", labelKey: "objectionHandling", color: "accent2" },
  { key: "closeAndNextSteps", labelKey: "closeAndNextSteps", color: "red" },
];


export default async function TrainerDashboardPage() {
  const [session, trainerId, t, tRubric] = await Promise.all([
    getSession(),
    getTrainerDbId(),
    getTranslations("Trainer"),
    getTranslations("Shared.rubric"),
  ]);
  if (!trainerId || !session) return null;

  const [trainerProfile, trainerCalls, allCalls, performanceTrends] = await Promise.all([
    getTrainerProfile(trainerId),
    getCalls({ trainerId }),
    getCalls(),
    getPerformanceTrends([{ id: trainerId, email: session.user.email ?? undefined }]),
  ]);

  const trainerName = trainerProfile?.name ?? "Trainer";

  // ── Totais históricos (todas as calls do trainer, sem janela) ────────────
  const totalCalls = trainerCalls.length;
  const closedCalls = trainerCalls.filter((c) => c.result === "closed").length;
  const totalAvgScore = totalCalls > 0
    ? Math.round(trainerCalls.reduce((sum, c) => sum + c.score, 0) / totalCalls)
    : 0;
  const totalCloseRate = totalCalls > 0 ? Math.round((closedCalls / totalCalls) * 100) : 0;

  // ── Buckets semanais (mais antigo → mais recente) ────────────────────────
  // 7 semanas = 6 da maior janela + 1 anterior pro delta da janela 6w.
  const BUCKET_WEEKS = 7;
  const weeklyBuckets: WeeklyBucket[] = (() => {
    const now = new Date();
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    currentMonday.setHours(0, 0, 0, 0);
    const out: WeeklyBucket[] = [];
    for (let w = BUCKET_WEEKS - 1; w >= 0; w--) {
      const ws = new Date(currentMonday);
      ws.setDate(ws.getDate() - w * 7);
      const we = new Date(ws);
      we.setDate(we.getDate() + 7);
      const inWeek = trainerCalls.filter((c) => {
        const d = new Date(c.date);
        return d >= ws && d < we;
      });
      if (inWeek.length === 0) {
        out.push({ score: 0, closeRate: 0, calls: 0, wins: 0, empty: true });
        continue;
      }
      const wins = inWeek.filter((c) => c.result === "closed").length;
      out.push({
        score: Math.round(inWeek.reduce((s, c) => s + c.score, 0) / inWeek.length),
        closeRate: Math.round((wins / inWeek.length) * 100),
        calls: inWeek.length,
        wins,
        empty: false,
      });
    }
    return out;
  })();

  // ── Rubric: trainer avg vs team avg (from real calls) ────────────────────
  const myRubric   = avgRubricScores(trainerCalls);
  const teamRubric = avgRubricScores(allCalls);

  const rubricRows = RUBRIC_SECTIONS.map((s) => ({
    ...s,
    value:   myRubric[s.key],
    teamAvg: teamRubric[s.key],
  }));

  const countLabel = totalCalls === 1
    ? t("callsAnalyzedOne", { count: totalCalls })
    : t("callsAnalyzedOther", { count: totalCalls });

  return (
    <div>
      {/* ── Greeting ──────────────────────────────────────────── */}
      <div className="mb-6">
        <SectionLabel>{t("dashboardLabel")}</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--am-text)" }}>
          {t("greeting", { name: trainerName })}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--am-muted)" }}>
          {countLabel}
        </p>
      </div>

      {/* ── KPI strip (4 métricas + sparkline + seletor de janela) ──── */}
      <TrainerKpiStrip
        buckets={weeklyBuckets}
        totals={{
          calls: totalCalls,
          wins: closedCalls,
          avgScore: totalAvgScore,
          closeRate: totalCloseRate,
        }}
      />

      {/* ── Personal rubric vs team avg ───────────────────────── */}
      <div className="rounded-2xl p-5 border mb-4" style={{ background: "var(--card)", borderColor: "var(--am-border)" }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[13px] font-medium mb-1" style={{ color: "var(--am-text)" }}>
              {t("myRubricTitle")}
            </p>
            <p className="text-xs" style={{ color: "var(--am-muted)" }}>
              {t("myRubricSubtitle")}
            </p>
          </div>
          <span
            className="flex items-center gap-1.5 text-[10px] flex-shrink-0 pt-0.5"
            style={{ color: "var(--am-muted)" }}
          >
            <Users size={11} aria-hidden="true" />
            {t("rubricLegendTeam")}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          {rubricRows.map((row) => (
            <RubricBar
              key={row.key}
              label={tRubric(row.labelKey)}
              value={row.value}
              color={row.color}
              teamAvg={row.teamAvg}
            />
          ))}
        </div>
      </div>

      {/* ── Performance trend ─────────────────────────────────── */}
      <PerformanceTrend trends={performanceTrends} fixedId={trainerId} />
    </div>
  );
}
