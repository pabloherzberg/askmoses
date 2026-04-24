export const dynamic = "force-dynamic";

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
import { DashboardStats, QuickLinks } from "./_components/DashboardStats";

export default async function DashboardPage() {
  const [
    trainers,
    insights,
    { sections: rubric, trainerSectionScores },
    revenueData,
    teamHealth,
  ] = await Promise.all([
    getTrainers(),
    getInsights(),
    getRubric(),
    getRevenueEstimator(),
    getTeamHealth(),
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
    <div className="space-y-6 pb-16 lg:pb-0">
      {/* ── Dashboard operacional (calls reais) ───────────────── */}
      <DashboardStats />

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

      {/* ── Main grid: team health + alerts ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 mb-4">
        {/* Team Health */}
        <div
          className="rounded-2xl p-5 border shadow-md"
          style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
        >
          <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
            <p className="text-[13px] font-medium" style={{ color: "var(--am-text)" }}>
              Team Health
            </p>
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded border"
              style={{ color: "var(--am-amber)", borderColor: "var(--am-amber)", background: "rgba(255,171,46,0.08)" }}
            >
              mock data only
            </span>
          </div>
          <p className="text-[11px] mb-4" style={{ color: "var(--am-muted)" }}>
            Who&apos;s improving · who needs attention this week
          </p>

          <div
            className="grid mb-2"
            style={{ gridTemplateColumns: "1fr auto auto auto auto" }}
          >
            <span className="text-[10px] font-medium" style={{ color: "var(--am-muted)" }}>TRAINER</span>
            <span className="text-[10px] font-medium text-right pr-4 hidden sm:block" style={{ color: "var(--am-muted)" }}>STATUS</span>
            <span className="text-[10px] font-medium text-right pr-4 hidden sm:block" style={{ color: "var(--am-muted)" }}>CLOSE %</span>
            <span className="text-[10px] font-medium text-right pr-4 hidden sm:block" style={{ color: "var(--am-muted)" }}>DELTA</span>
            <span className="text-[10px] font-medium text-right" style={{ color: "var(--am-muted)" }}>↑↓</span>
          </div>

          {teamHealth.map((entry, i) => {
            const ringColor = entry.trend === 'up' ? 'var(--am-green)' : 'var(--am-red)'
            const dotColor =
              entry.statusType === 'active' ? 'var(--am-green)'
              : entry.statusType === 'away'   ? 'var(--am-red)'
              : 'var(--am-muted)'
            const deltaColor = entry.delta >= 0 ? 'var(--am-green)' : 'var(--am-red)'
            const deltaLabel = entry.delta > 0
              ? `+${entry.delta} pt${Math.abs(entry.delta) !== 1 ? 's' : ''}`
              : `${entry.delta} pt${Math.abs(entry.delta) !== 1 ? 's' : ''}`

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
                      {entry.calls} calls
                    </p>
                  </div>
                </div>

                <div className="pr-4 hidden sm:flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                  <span className="text-[12px] whitespace-nowrap" style={{ color: dotColor }}>
                    {entry.status}
                  </span>
                </div>

                <span className="text-[13px] font-mono font-semibold text-right pr-4 hidden sm:block" style={{ color: "var(--am-text)" }}>
                  {entry.closeRate}%
                </span>

                <span className="text-[13px] font-mono font-semibold text-right pr-4 hidden sm:block" style={{ color: deltaColor }}>
                  {deltaLabel}
                </span>

                <span className="text-[16px] font-bold text-right" style={{ color: deltaColor }}>
                  {entry.trend === 'up' ? '↑' : '↓'}
                </span>
              </div>
            )
          })}

          <p className="mt-3 text-[10px]" style={{ color: "var(--am-amber)" }}>
            † green dot = improving · red dot = declining · all values from mock-data.ts · no real calculation
          </p>
        </div>

        {/* Active alerts */}
        <div
          className="rounded-2xl p-5 border shadow-md flex flex-col"
          style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
        >
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

          <p className="text-[10px] mt-4 leading-relaxed" style={{ color: "var(--am-amber)" }}>
            ↑ red = critical · yellow = warning · green = positive · CTAs non-functional in demo · data from mock-data.ts
          </p>
        </div>
      </div>

      {/* ── Charts: rubric + performance trend ───────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                style={{ color: "var(--am-muted)", borderBottom: "1px solid var(--am-border)" }}
              >
                Section
              </th>
              <th
                className="text-[11px] font-medium text-right pb-2.5 px-2"
                style={{ color: "var(--am-muted)", borderBottom: "1px solid var(--am-border)" }}
              >
                Team
              </th>
              {trainerSectionScores.map((t) => (
                <th
                  key={t.trainerId}
                  className="text-[11px] font-medium text-right pb-2.5 px-2"
                  style={{ color: "var(--am-muted)", borderBottom: "1px solid var(--am-border)" }}
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
                    style={{ color: "var(--am-muted)", borderBottom: "1px solid var(--am-border)" }}
                  >
                    {section.name}
                  </td>
                  <td
                    className="text-xs text-right font-mono px-2 py-2.5"
                    style={{
                      color: section.teamAvg < 3.25 ? "var(--am-red)" : "var(--am-text)",
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

      {/* ── Quick Links ───────────────────────────────────────── */}
      <QuickLinks />
    </div>
  );
}
