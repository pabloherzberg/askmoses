export const dynamic = "force-dynamic";

import { getTrainers, getPerformanceTrends } from "@/lib/services/trainers";
import { getInsights } from "@/lib/services/insights";
import { getRubric, getRevenueEstimator } from "@/lib/services/rubric";
import { ScoreCard } from "@/components/shared/ScoreCard";
import { ScorePill } from "@/components/shared/ScorePill";
import { RubricBar } from "@/components/shared/RubricBar";
import { InsightCard } from "@/components/shared/InsightCard";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { CorrelationEngine } from "@/components/shared/CorrelationEngine";
import { correlationEngine, rubricGaps, activeAlerts } from "@/lib/mock-data";
import { RubricGapDetection } from "@/components/shared/RubricGapDetection";
import { RevenueEstimator } from "@/components/shared/RevenueEstimator";
import { PerformanceTrend } from "@/components/shared/PerformanceTrend";

const avatarBgMap: Record<string, string> = {
  blue: "var(--am-blue-bg)",
  purple: "rgba(110,86,255,0.15)",
  green: "var(--am-green-bg)",
  red: "var(--am-red-bg)",
};

const avatarTextMap: Record<string, string> = {
  blue: "var(--am-blue)",
  purple: "var(--am-accent2)",
  green: "var(--am-green)",
  red: "var(--am-red)",
};

export default async function OverviewPage() {
  const [
    trainers,
    insights,
    { sections: rubric, trainerSectionScores },
    revenueData,
  ] = await Promise.all([
    getTrainers(),
    getInsights(),
    getRubric(),
    getRevenueEstimator(),
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
      ? Math.round(trainers.reduce((s, t) => s + t.score, 0) / trainers.length)
      : 0;
  const topTrainer = sorted[0] ?? null;

  return (
    <div>
      {/* ── Team overview ─────────────────────────────────────── */}
      <SectionLabel>Team Overview</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <ScoreCard
          label="Est. Monthly Revenue"
          value="$18,200"
          valueColor="var(--am-green)"
          delta={12}
          deltaLabel="% vs baseline"
        />
        <ScoreCard
          label="Avg Close Rate"
          value={`${avgClose}%`}
          valueColor="var(--am-green)"
          delta={7}
          deltaLabel="pts since week 1"
        />
        <ScoreCard
          label="Avg Score"
          value={avgScore}
          valueColor="var(--am-accent2)"
          delta={11}
          deltaLabel="pts since week 1"
        />
        <ScoreCard
          label="Total Calls"
          value={totalCalls}
          deltaLabel={`${trainers.length} active sales people`}
        />
        <ScoreCard
          label="Best Close Rate"
          value={`${topTrainer?.closeRate ?? 0}%`}
          delta={topTrainer?.closeDelta ?? 0}
          deltaLabel={topTrainer?.name ?? "No trainers"}
        />
      </div>

      {/* ── Correlation Engine ────────────────────────────────── */}
      <div className="mb-4">
        <CorrelationEngine factors={correlationEngine} />
      </div>

      {/* ── Rubric Gap Detection ───────────────────────────────── */}
      <div className="mb-4">
        <RubricGapDetection gaps={rubricGaps} />
      </div>

      {/* ── Main grid: ranking + alerts ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 mb-4">
        {/* Trainer ranking */}
        <div
          className="rounded-2xl p-5 border shadow-md"
          style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
        >
          <p
            className="text-[13px] font-medium mb-4"
            style={{ color: "var(--am-text)" }}
          >
            Sales Team Ranking
          </p>
          {sorted.map((trainer, i) => (
            <div
              key={trainer.id}
              className="flex items-center gap-3 py-2.5"
              style={{
                borderBottom:
                  i < sorted.length - 1 ? "1px solid var(--am-border)" : "none",
              }}
            >
              <div
                className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-xs font-semibold font-mono flex-shrink-0"
                style={{
                  background: avatarBgMap[trainer.avatarColor],
                  color: avatarTextMap[trainer.avatarColor],
                }}
              >
                {trainer.avatar}
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className="text-[13px] font-medium truncate"
                  style={{ color: "var(--am-text)" }}
                >
                  {trainer.name}
                </p>
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--am-muted)" }}
                >
                  {trainer.lastActive} · {trainer.totalCalls} calls
                </p>
              </div>

              <div className="flex items-center gap-2 md:gap-3.5 flex-shrink-0">
                <div className="text-right hidden sm:block">
                  <div
                    className="text-sm font-semibold font-mono"
                    style={{ color: "var(--am-text)" }}
                  >
                    {trainer.closeRate}%
                  </div>
                  <div
                    className="text-[10px]"
                    style={{ color: "var(--am-muted)" }}
                  >
                    close
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <div
                    className="text-sm font-semibold font-mono"
                    style={{
                      color:
                        trainer.closeDelta >= 0
                          ? "var(--am-green)"
                          : "var(--am-red)",
                    }}
                  >
                    {trainer.closeDelta > 0
                      ? `+${trainer.closeDelta}`
                      : trainer.closeDelta}
                  </div>
                  <div
                    className="text-[10px]"
                    style={{ color: "var(--am-muted)" }}
                  >
                    delta
                  </div>
                </div>
                <ScorePill score={trainer.score} />
              </div>
            </div>
          ))}
        </div>

        {/* Active alerts */}
        <div
          className="rounded-2xl p-5 border shadow-md flex flex-col"
          style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <p className="text-[13px] font-medium" style={{ color: "var(--am-text)" }}>
              Active Alerts
            </p>
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded border"
              style={{ color: "var(--am-amber)", borderColor: "var(--am-amber)", background: "rgba(255,171,46,0.08)" }}
            >
              mock data only
            </span>
          </div>
          <p className="text-[11px] mb-4" style={{ color: "var(--am-muted)" }}>
            {activeAlerts.length} items requiring attention
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

          {/* Footer note */}
          <p className="text-[10px] mt-4 leading-relaxed" style={{ color: "var(--am-amber)" }}>
            ↑ red = critical · yellow = warning · green = positive · CTAs non-functional in demo · data from mock-data.ts
          </p>
        </div>
      </div>

      {/* ── Charts: rubric + performance trend ───────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Rubric bars */}
        <div
          className="rounded-2xl p-5 border shadow-md"
          style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
        >
          <p
            className="text-[13px] font-medium mb-4"
            style={{ color: "var(--am-text)" }}
          >
            Rubric by Section — Team Average
          </p>
          <div className="flex flex-col gap-2.5">
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

        {/* Performance trend */}
        <PerformanceTrend
          trends={performanceTrends}
          salesPeople={trainers.map((t) => ({ id: t.id, name: t.name }))}
        />
      </div>

      {/* ── Revenue Impact Estimator ──────────────────────────── */}
      <RevenueEstimator items={revenueData.items} total={revenueData.total} />

      {/* ── Detailed rubric table ──────────────────────────────── */}
      <SectionLabel>Score by Sales Person — Detailed Rubric</SectionLabel>
      <div
        className="rounded-2xl p-5 border mb-4 overflow-x-auto"
        style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
      >
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
                Section
              </th>
              <th
                className="text-[11px] font-medium text-right pb-2.5 px-2"
                style={{
                  color: "var(--am-muted)",
                  borderBottom: "1px solid var(--am-border)",
                }}
              >
                Team
              </th>
              {trainerSectionScores.map((t) => (
                <th
                  key={t.trainerId}
                  className="text-[11px] font-medium text-right pb-2.5 px-2"
                  style={{
                    color: "var(--am-muted)",
                    borderBottom: "1px solid var(--am-border)",
                  }}
                >
                  {t.trainerName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rubric.map((section) => {
              const trainerScores = trainerSectionScores.map(
                (t) => t.scores[section.name] ?? 0,
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
      <SectionLabel>AI Insights</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}
