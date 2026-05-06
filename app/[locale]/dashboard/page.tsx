export const dynamic = "force-dynamic";

import { getTranslations } from "next-intl/server";
import { getTrainers, getPerformanceTrends, getTeamHealth } from "@/lib/services/trainers";
import { getInsights } from "@/lib/services/insights";
import { getRubric, getRevenueEstimator } from "@/lib/services/rubric";
import { ScoreCard } from "@/components/shared/ScoreCard";
import { RubricBar } from "@/components/shared/RubricBar";
import { InsightCard } from "@/components/shared/InsightCard";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { CorrelationEngine } from "@/components/shared/CorrelationEngine";
import { correlationEngine, rubricGaps, activeAlerts } from "@/lib/mock-data";
import { RubricGapDetection } from "@/components/shared/RubricGapDetection";
import { RevenueEstimator } from "@/components/shared/RevenueEstimator";
import { PerformanceTrend } from "@/components/shared/PerformanceTrend";



export default async function DashboardPage() {
  const [
    trainers,
    insights,
    { sections: rubric, trainerSectionScores },
    revenueData,
    teamHealth,
    t,
    tMetrics,
    tHealth,
    tAlerts,
  ] = await Promise.all([
    getTrainers(),
    getInsights(),
    getRubric(),
    getRevenueEstimator(),
    getTeamHealth(),
    getTranslations("Owner"),
    getTranslations("Owner.metrics"),
    getTranslations("Owner.teamHealth"),
    getTranslations("Owner.activeAlerts"),
  ]);

  const performanceTrends = await getPerformanceTrends(trainers);

  const sorted = [...trainers].sort((a, b) => b.score - a.score);
  const totalCalls = trainers.reduce((s, t) => s + t.totalCalls, 0);
  const avgClose =
    trainers.length > 0
      ? Math.round(
          trainers.reduce((s, t) => s + t.closeRate, 0) / trainers.length,
        )
      : 0;
  const avgScore =
    trainers.length > 0
      ? Math.round((trainers.reduce((s, t) => s + t.score, 0) / trainers.length) * 10) / 10
      : 0;
  const topTrainer = sorted[0] ?? null;

  const activeSalesPeopleLabel = trainers.length === 1
    ? tMetrics("activeSalesPeopleOne", { count: trainers.length })
    : tMetrics("activeSalesPeopleOther", { count: trainers.length });

  const alertsCountLabel = activeAlerts.length === 1
    ? tAlerts("itemsCountOne", { count: activeAlerts.length })
    : tAlerts("itemsCountOther", { count: activeAlerts.length });

  return (
    <div>
      {/* ── Team overview ─────────────────────────────────────── */}
      <SectionLabel>{t("teamOverview")}</SectionLabel>

      {/* Hero KPI row: Close Rate em destaque + 3 secundários */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {/* Hero — Avg Close Rate */}
        <ScoreCard
          label={tMetrics("avgCloseRate")}
          value={`${avgClose}%`}
          valueColor="var(--am-green)"
          delta={7}
          deltaLabel={tMetrics("ptsSinceWeek1")}
          className="col-span-1"
          style={{
            background: "linear-gradient(135deg, rgba(34,217,160,0.10) 0%, var(--card) 60%)",
            borderColor: "rgba(34,217,160,0.30)",
            boxShadow: "0 0 0 1px rgba(34,217,160,0.10), 0 4px 24px rgba(34,217,160,0.08)",
          }}
        />
        <ScoreCard
          label={tMetrics("teamAvgCallScore")}
          value={avgScore}
          valueColor="var(--am-accent2)"
          delta={11}
          deltaLabel={tMetrics("ptsSinceWeek1")}
        />
        <ScoreCard
          label={tMetrics("monthlyRevenue")}
          value="$18,200"
          valueColor="var(--am-green)"
          delta={12}
          deltaLabel={tMetrics("vsBaseline")}
        />
        <ScoreCard
          label={tMetrics("totalCalls")}
          value={totalCalls}
          deltaLabel={activeSalesPeopleLabel}
        />
      </div>

      {/* ── Conversion Rate Trend — destaque máximo ───────────── */}
      <PerformanceTrend
        trends={performanceTrends}
        salesPeople={trainers.map((t) => ({ id: t.id, name: t.name }))}
        chartHeight={280}
      />

      {/* ── Correlation Engine ────────────────────────────────── */}
      <div className="mb-4">
        <CorrelationEngine factors={correlationEngine} />
      </div>

      {/* ── Rubric Gap Detection ───────────────────────────────── */}
      <div className="mb-4">
        <RubricGapDetection gaps={rubricGaps} />
      </div>

      {/* ── Main grid: team health + alerts ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 mb-4">
        {/* Team Health */}
        <div
          className="rounded-2xl p-5 border shadow-md"
          style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
            <p className="text-[13px] font-medium" style={{ color: "var(--am-text)" }}>
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
            <span className="text-[10px] font-medium" style={{ color: "var(--am-muted)" }}>{tHealth("th.trainer")}</span>
            <span className="text-[10px] font-medium text-right pr-4 hidden sm:block" style={{ color: "var(--am-muted)" }}>{tHealth("th.status")}</span>
            <span className="text-[10px] font-medium text-right pr-4 hidden sm:block" style={{ color: "var(--am-muted)" }}>{tHealth("th.closeRate")}</span>
            <span className="text-[10px] font-medium text-right pr-4 hidden sm:block" style={{ color: "var(--am-muted)" }}>{tHealth("th.delta")}</span>
            <span className="text-[10px] font-medium text-right" style={{ color: "var(--am-muted)" }}>↑↓</span>
          </div>

          {/* Rows */}
          {teamHealth.map((entry, i) => {
            const ringColor = entry.trend === 'up' ? 'var(--am-green)' : 'var(--am-red)'
            const dotColor =
              entry.statusType === 'active' ? 'var(--am-green)'
              : entry.statusType === 'away'   ? 'var(--am-red)'
              : 'var(--am-muted)'
            const deltaColor = entry.delta >= 0 ? 'var(--am-green)' : 'var(--am-red)'
            const ptsLabel = Math.abs(entry.delta) === 1 ? tHealth('ptsOne') : tHealth('ptsOther')
            const deltaLabel = entry.delta > 0
              ? `+${entry.delta} ${ptsLabel}`
              : `${entry.delta} ${ptsLabel}`
            const callsLabel = entry.calls === 1
              ? tHealth('callsLabelOne', { count: entry.calls })
              : tHealth('callsLabelOther', { count: entry.calls })

            const avatarBg: Record<string, string> = {
              blue: 'var(--am-blue-bg)', purple: 'rgba(110,86,255,0.15)',
              green: 'var(--am-green-bg)', red: 'var(--am-red-bg)', amber: 'rgba(255,171,46,0.15)',
            }
            const avatarText: Record<string, string> = {
              blue: 'var(--am-blue)', purple: 'var(--am-accent2)',
              green: 'var(--am-green)', red: 'var(--am-red)', amber: 'var(--am-amber)',
            }

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
                      style={{ background: avatarBg[entry.avatarColor], color: avatarText[entry.avatarColor] }}
                    >
                      {entry.initials}
                    </div>
                    <span
                      className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                      style={{ background: ringColor, borderColor: "var(--card)" }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--am-text)" }}>
                      {entry.name}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--am-muted)" }}>
                      {callsLabel}
                    </p>
                  </div>
                </div>

                {/* Status */}
                <div className="pr-4 hidden sm:flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                  <span className="text-[12px] whitespace-nowrap" style={{ color: dotColor }}>
                    {entry.status}
                  </span>
                </div>

                {/* Close rate */}
                <span className="text-[13px] font-mono font-semibold text-right pr-4 hidden sm:block" style={{ color: "var(--am-text)" }}>
                  {entry.closeRate}%
                </span>

                {/* Delta */}
                <span className="text-[13px] font-mono font-semibold text-right pr-4 hidden sm:block" style={{ color: deltaColor }}>
                  {deltaLabel}
                </span>

                {/* Trend arrow */}
                <span className="text-[16px] font-bold text-right" style={{ color: deltaColor }}>
                  {entry.trend === 'up' ? '↑' : '↓'}
                </span>
              </div>
            )
          })}

        </div>

        {/* Active alerts */}
        <div
          className="rounded-2xl p-5 border shadow-md flex flex-col"
          style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <p className="text-[13px] font-medium" style={{ color: "var(--am-text)" }}>
              {tAlerts("title")}
            </p>
          </div>
          <p className="text-[11px] mb-4" style={{ color: "var(--am-muted)" }}>
            {alertsCountLabel}
          </p>

          {/* Alert items */}
          <div className="flex flex-col gap-0 flex-1">
            {activeAlerts.map((alert, i) => {
              const dotColor =
                alert.dotColor === "red"
                  ? "var(--am-red)"
                  : alert.dotColor === "amber"
                    ? "var(--am-amber)"
                    : "var(--am-green)";
              const ctaColor =
                alert.dotColor === "red"
                  ? "var(--am-red)"
                  : alert.dotColor === "amber"
                    ? "var(--am-amber)"
                    : "var(--am-green)";
              const ctaBorder =
                alert.dotColor === "red"
                  ? "rgba(255,94,94,0.35)"
                  : alert.dotColor === "amber"
                    ? "rgba(255,171,46,0.35)"
                    : "rgba(34,217,160,0.35)";
              const ctaBg =
                alert.dotColor === "red"
                  ? "rgba(255,94,94,0.08)"
                  : alert.dotColor === "amber"
                    ? "rgba(255,171,46,0.08)"
                    : "rgba(34,217,160,0.08)";

              return (
                <div
                  key={alert.message}
                  className="py-3"
                  style={{
                    borderBottom:
                      i < activeAlerts.length - 1
                        ? "1px solid var(--am-border)"
                        : "none",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: dotColor, boxShadow: `0 0 5px ${dotColor}` }}
                    />
                    <span className="text-[12px] font-medium" style={{ color: "var(--am-text)" }}>
                      {alert.message}
                    </span>
                  </div>
                  <button
                    className="text-[11px] font-medium px-3 py-1 rounded border ml-[18px]"
                    style={{ color: ctaColor, borderColor: ctaBorder, background: ctaBg }}
                  >
                    {alert.cta} →
                  </button>
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* ── Rubric by section ─────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 border shadow-md mb-4"
        style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
      >
        <p
          className="text-[13px] font-medium mb-4"
          style={{ color: "var(--am-text)" }}
        >
          {t("rubricBySection")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
          {rubric.map((section) => (
            <RubricBar
              key={section.id}
              label={section.name}
              value={section.teamAvg}
              color={section.color}
            />
          ))}
        </div>
      </div>

      {/* ── Revenue Impact Estimator ──────────────────────────── */}
      <RevenueEstimator items={revenueData.items} total={revenueData.total} />

      {/* ── Detailed rubric table ──────────────────────────────── */}
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
                {t("detailedRubricTh.section")}
              </th>
              <th
                className="text-[11px] font-medium text-right pb-2.5 px-2"
                style={{
                  color: "var(--am-muted)",
                  borderBottom: "1px solid var(--am-border)",
                }}
              >
                {t("detailedRubricTh.team")}
              </th>
              {trainerSectionScores.map((tr) => (
                <th
                  key={tr.trainerId}
                  className="text-[11px] font-medium text-right pb-2.5 px-2"
                  style={{
                    color: "var(--am-muted)",
                    borderBottom: "1px solid var(--am-border)",
                  }}
                >
                  {tr.trainerName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rubric.map((section) => {
              const trainerScores = trainerSectionScores.map(
                (tr) => tr.scores[section.name] ?? 0,
              );
              const maxScore =
                trainerScores.length > 0 ? Math.max(...trainerScores) : 0;

              return (
                <tr key={section.id}>
                  <td
                    className="text-xs py-2.5 pr-2"
                    style={{
                      color: "var(--am-muted)",
                      borderBottom: "1px solid var(--am-border)",
                    }}
                  >
                    {section.name}
                  </td>
                  <td
                    className="text-xs text-right font-mono px-2 py-2.5"
                    style={{
                      color:
                        section.teamAvg < 3.25
                          ? "var(--am-red)"
                          : "var(--am-text)",
                      borderBottom: "1px solid var(--am-border)",
                    }}
                  >
                    {section.teamAvg.toFixed(1)}
                  </td>
                  {trainerScores.map((s, idx) => (
                    <td
                      key={idx}
                      className="text-xs text-right font-mono px-2 py-2.5"
                      style={{
                        color:
                          s === maxScore
                            ? "var(--am-green)"
                            : s < 3.25
                              ? "var(--am-red)"
                              : "var(--am-text)",
                        fontWeight: s === maxScore ? 600 : 400,
                        borderBottom: "1px solid var(--am-border)",
                      }}
                    >
                      {s.toFixed(1)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
