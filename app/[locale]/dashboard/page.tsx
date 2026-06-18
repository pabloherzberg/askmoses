export const dynamic = "force-dynamic";

import { getLocale, getTranslations } from "next-intl/server";
import {
  getTrainers,
  getPerformanceTrends,
  getTeamHealth,
} from "@/lib/services/trainers";
import { getInsights } from "@/lib/services/insights";
import { getIntentSignals } from "@/lib/services/intent";
import type { Locale } from "@/i18n/routing";
import { getRubric, buildCoachingDrivers } from "@/lib/services/rubric";
import { getScriptGaps } from "@/lib/services/script-gaps";
import { ScoreCard } from "@/components/shared/ScoreCard";
import { scoreLevel, toDisplay5, toNumber5 } from "@/lib/score-display";
import { InsightCard } from "@/components/shared/InsightCard";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { CorrelationEngine } from "@/components/shared/CorrelationEngine";
import { ScriptGapDetection } from "@/components/shared/ScriptGapDetection";
import { CloseRateTrend } from "@/components/shared/CloseRateTrend";
import { PendingScriptBanner } from "@/components/shared/PendingScriptBanner";
import { IntentDashboard } from "@/components/shared/IntentDashboard";
import { getActiveOrgContext } from "@/lib/auth";

export default async function DashboardPage() {
  const locale = (await getLocale()) as Locale;
  const [
    trainers,
    insights,
    { sections: rubric, trend: teamTrend, trainerSectionScores },
    teamHealth,
    ctx,
    gapAnalysis,
    intentSignals,
    t,
    tMetrics,
    tHealth,
    tIntent,
  ] = await Promise.all([
    getTrainers(),
    getInsights(locale),
    getRubric(),
    getTeamHealth(),
    getActiveOrgContext(),
    getScriptGaps(),
    getIntentSignals().catch(() => []),
    getTranslations("Owner"),
    getTranslations("Owner.metrics"),
    getTranslations("Owner.teamHealth"),
    getTranslations("Intent"),
  ]);

  // Banner só pra Owner real — Admin impersonando não tem poder de
  // accept/reject, então esconder evita CTA frustrante.
  const showPendingBanner = ctx?.role === "owner" && !ctx.isImpersonating;

  const coachingDrivers = buildCoachingDrivers(rubric);

  const performanceTrends = await getPerformanceTrends(trainers);

  const totalCalls = trainers.reduce((s, tr) => s + tr.totalCalls, 0);

  // Médias do time consideram só vendedores que já fizeram ao menos 1 call —
  // um trainer recém-adicionado (0 calls → score/closeRate 0) não deve puxar
  // os KPIs do time pra baixo.
  const ratedTrainers = trainers.filter((tr) => tr.totalCalls > 0);
  const avgClose =
    ratedTrainers.length > 0
      ? Math.round(
          ratedTrainers.reduce((s, tr) => s + tr.closeRate, 0) /
            ratedTrainers.length,
        )
      : 0;
  const avgScore =
    ratedTrainers.length > 0
      ? Math.round(
          (ratedTrainers.reduce((s, tr) => s + tr.score, 0) /
            ratedTrainers.length) *
            10,
        ) / 10
      : 0;

  // Tendência de close rate do time — 6 semanas reais (getRubric().trend).
  // buildWeeklyTrend emite closeRate/score = 0 para semanas SEM calls. Usar
  // uma semana vazia como ponta do delta gera lixo (ex.: -100pts quando a
  // semana atual ainda não teve calls). Por isso o delta "desde a semana 1" só
  // olha semanas com calls de fato (score > 0) e some se houver menos de 2.
  const populatedWeeks = teamTrend.filter((w) => w.score > 0);
  const firstWeek = populatedWeeks[0];
  const lastWeek = populatedWeeks[populatedWeeks.length - 1];
  const hasTrend = populatedWeeks.length >= 2;
  const closeRateDelta = hasTrend
    ? lastWeek.closeRate - firstWeek.closeRate
    : undefined;
  const scoreDelta = hasTrend
    ? Math.round(
        (toNumber5(lastWeek.score) - toNumber5(firstWeek.score)) * 10,
      ) / 10
    : undefined;
  const trendSummary = {
    from: firstWeek?.closeRate ?? 0,
    to: lastWeek?.closeRate ?? 0,
    delta: closeRateDelta ?? 0,
  };

  // Gráfico de tendência: mantém as 6 semanas no eixo; semana sem call vira
  // null (lacuna no gráfico) em vez de uma barra de 0% que confundiria.
  const closeRateChartData = teamTrend.map((w) => ({
    week: w.week,
    closeRate: w.score > 0 ? w.closeRate : null,
  }));

  // Maior nota por seção — destaca o melhor vendedor de cada coluna.
  const sectionMax: Record<string, number> = {};
  for (const section of rubric) {
    sectionMax[section.name] = Math.max(
      0,
      ...trainerSectionScores.map((tr) => tr.scores[section.name] ?? 0),
    );
  }

  return (
    <div>
      {showPendingBanner && <PendingScriptBanner />}

      {/* ── Team overview ─────────────────────────────────────── */}
      <SectionLabel>{t("teamOverview")}</SectionLabel>

      {/* Hero KPI row: Close Rate em destaque + 3 secundários */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {/* Hero — Avg Close Rate */}
        <ScoreCard
          label={tMetrics("avgCloseRate")}
          value={`${avgClose}%`}
          valueColor="var(--am-green)"
          delta={closeRateDelta}
          deltaLabel={
            closeRateDelta !== undefined ? tMetrics("ptsSinceWeek1") : undefined
          }
          className="col-span-1"
          style={{
            background:
              "linear-gradient(135deg, rgba(34,217,160,0.10) 0%, var(--card) 60%)",
            borderColor: "rgba(34,217,160,0.30)",
            boxShadow:
              "0 0 0 1px rgba(34,217,160,0.10), 0 4px 24px rgba(34,217,160,0.08)",
          }}
        />
        <ScoreCard
          label={tMetrics("teamAvgCallScore")}
          value={toDisplay5(avgScore)}
          valueColor="var(--am-accent2)"
          delta={scoreDelta}
          deltaLabel={
            scoreDelta !== undefined ? tMetrics("ptsSinceWeek1") : undefined
          }
        />
        <ScoreCard label={tMetrics("totalCalls")} value={totalCalls} />
        <ScoreCard
          label={tMetrics("activeSalesPeople")}
          value={trainers.length}
        />
      </div>

      {/* ── Correlation Engine ────────────────────────────────── */}
      <div className="mb-4">
        <CorrelationEngine factors={coachingDrivers} totalCalls={totalCalls} />
      </div>

      {/* ── Team Health ───────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 border shadow-md mb-4"
        style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
          <p
            className="text-[13px] font-medium"
            style={{ color: "var(--am-text)" }}
          >
            {tHealth("title")}
          </p>
        </div>
        <p className="text-[11px] mb-4" style={{ color: "var(--am-muted)" }}>
          {tHealth("subtitle")}
        </p>

        {/* Column headers */}
        <div
          className="grid mb-2"
          style={{ gridTemplateColumns: "1fr auto auto auto auto" }}
        >
          <span
            className="text-[10px] font-medium"
            style={{ color: "var(--am-muted)" }}
          >
            {tHealth("th.trainer")}
          </span>
          <span
            className="text-[10px] font-medium text-right pr-4 hidden sm:block"
            style={{ color: "var(--am-muted)" }}
          >
            {tHealth("th.status")}
          </span>
          <span
            className="text-[10px] font-medium text-right pr-4 hidden sm:block"
            style={{ color: "var(--am-muted)" }}
          >
            {tHealth("th.closeRate")}
          </span>
          <span
            className="text-[10px] font-medium text-right pr-4 hidden sm:block"
            style={{ color: "var(--am-muted)" }}
          >
            {tHealth("th.delta")}
          </span>
          <span
            className="text-[10px] font-medium text-right"
            style={{ color: "var(--am-muted)" }}
          >
            ↑↓
          </span>
        </div>

        {/* Rows */}
        {teamHealth.map((entry, i) => {
          const ringColor =
            entry.trend === "up" ? "var(--am-green)" : "var(--am-red)";
          const dotColor =
            entry.statusType === "active"
              ? "var(--am-green)"
              : entry.statusType === "away"
                ? "var(--am-red)"
                : "var(--am-muted)";
          const deltaColor =
            entry.delta >= 0 ? "var(--am-green)" : "var(--am-red)";
          const ptsLabel =
            Math.abs(entry.delta) === 1 ? tHealth("ptsOne") : tHealth("ptsOther");
          const deltaLabel =
            entry.delta > 0
              ? `+${entry.delta} ${ptsLabel}`
              : `${entry.delta} ${ptsLabel}`;
          const callsLabel =
            entry.calls === 1
              ? tHealth("callsLabelOne", { count: entry.calls })
              : tHealth("callsLabelOther", { count: entry.calls });

          const avatarBg: Record<string, string> = {
            blue: "var(--am-blue-bg)",
            purple: "rgba(110,86,255,0.15)",
            green: "var(--am-green-bg)",
            red: "var(--am-red-bg)",
            amber: "rgba(255,171,46,0.15)",
          };
          const avatarText: Record<string, string> = {
            blue: "var(--am-blue)",
            purple: "var(--am-accent2)",
            green: "var(--am-green)",
            red: "var(--am-red)",
            amber: "var(--am-amber)",
          };

          return (
            <div
              key={entry.name}
              className="grid items-center py-2.5"
              style={{
                gridTemplateColumns: "1fr auto auto auto auto",
                borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
              }}
            >
              {/* Avatar + name + calls */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative flex-shrink-0">
                  <div
                    className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-xs font-semibold font-mono"
                    style={{
                      background: avatarBg[entry.avatarColor],
                      color: avatarText[entry.avatarColor],
                    }}
                  >
                    {entry.initials}
                  </div>
                  <span
                    className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                    style={{
                      background: ringColor,
                      borderColor: "var(--card)",
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <p
                    className="text-[13px] font-medium truncate"
                    style={{ color: "var(--am-text)" }}
                  >
                    {entry.name}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--am-muted)" }}>
                    {callsLabel}
                  </p>
                </div>
              </div>

              {/* Status */}
              <div className="pr-4 hidden sm:flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: dotColor }}
                />
                <span
                  className="text-[12px] whitespace-nowrap"
                  style={{ color: dotColor }}
                >
                  {entry.status}
                </span>
              </div>

              {/* Close rate */}
              <span
                className="text-[13px] font-mono font-semibold text-right pr-4 hidden sm:block"
                style={{ color: "var(--am-text)" }}
              >
                {entry.closeRate}%
              </span>

              {/* Delta */}
              <span
                className="text-[13px] font-mono font-semibold text-right pr-4 hidden sm:block"
                style={{ color: deltaColor }}
              >
                {deltaLabel}
              </span>

              {/* Trend arrow */}
              <span
                className="text-[16px] font-bold text-right"
                style={{ color: deltaColor }}
              >
                {entry.trend === "up" ? "↑" : "↓"}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Close Rate Trend ──────────────────────────────────── */}
      <CloseRateTrend
        data={closeRateChartData}
        summary={trendSummary}
        trainerTrends={performanceTrends}
        salesPeople={trainers.map((t) => ({ id: t.id, name: t.name }))}
      />

      {/* ── Script Gap Detection ──────────────────────────────── */}
      <div className="mb-4">
        <ScriptGapDetection
          gaps={gapAnalysis?.gaps ?? []}
          analyzedAt={gapAnalysis?.analyzedAt ?? null}
          callsAnalyzed={gapAnalysis?.callsAnalyzed ?? []}
        />
      </div>

      {/* ── Score by Sales Person ─────────────────────────────── */}
      <div
        className="rounded-2xl p-5 border mb-4 overflow-x-auto"
        style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
      >
        <p
          className="text-[11px] font-semibold tracking-widest uppercase mb-4"
          style={{ color: "var(--am-muted)" }}
        >
          {t("detailedRubricLabel")}
        </p>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th
                className="text-[11px] font-medium text-left pb-2.5 pr-2"
                style={{
                  color: "var(--am-muted)",
                  borderBottom: "1px solid var(--am-border)",
                }}
              >
                {t("detailedRubricTh.salesPerson")}
              </th>
              {rubric.map((section) => (
                <th
                  key={section.id}
                  className="text-[11px] font-medium text-right pb-2.5 px-2"
                  style={{
                    color: "var(--am-muted)",
                    borderBottom: "1px solid var(--am-border)",
                  }}
                >
                  {section.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trainerSectionScores.map((tr) => (
              <tr key={tr.trainerId}>
                <td
                  className="text-xs py-2.5 pr-2"
                  style={{
                    color: "var(--am-muted)",
                    borderBottom: "1px solid var(--am-border)",
                  }}
                >
                  {tr.trainerName}
                </td>
                {rubric.map((section) => {
                  const s = tr.scores[section.name] ?? 0;
                  const columnMax = sectionMax[section.name] ?? 0;
                  const isBest = s > 0 && s === columnMax;
                  return (
                    <td
                      key={section.id}
                      className="text-xs text-right font-mono px-2 py-2.5"
                      style={{
                        color: isBest
                          ? "var(--am-green)"
                          : scoreLevel(s) === "low"
                            ? "var(--am-red)"
                            : "var(--am-text)",
                        fontWeight: isBest ? 600 : 400,
                        borderBottom: "1px solid var(--am-border)",
                      }}
                    >
                      {toDisplay5(s)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Ask Moses Intent Index ────────────────────────────── */}
      {intentSignals.length > 0 && (
        <>
          <SectionLabel>{tIntent("sectionLabel")}</SectionLabel>
          <IntentDashboard signals={intentSignals} />
        </>
      )}

      {/* ── AI Insights ───────────────────────────────────────── */}
      <SectionLabel>{t("aiInsights")}</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}
