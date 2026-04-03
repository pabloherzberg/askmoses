import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getCalls, avgRubricScores } from "@/lib/services/calls";
import { ScoreCard } from "@/components/shared/ScoreCard";
import { RubricBar } from "@/components/shared/RubricBar";
import { ScorePill } from "@/components/shared/ScorePill";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { getSession, getTrainerDbId } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { RESULT_STYLES, DEFAULT_RESULT_STYLE } from "@/lib/constants";
import type { RubricColor, RubricScores } from "@/lib/types";

const RUBRIC_SECTIONS: { key: keyof RubricScores; name: string; color: RubricColor }[] = [
  { key: "discovery",         name: "Discovery",          color: "blue" },
  { key: "problemAgitation",  name: "Problem Agitation",  color: "amber" },
  { key: "offerPresentation", name: "Offer Presentation", color: "green" },
  { key: "objectionHandling", name: "Objection Handling", color: "accent2" },
  { key: "closeAndNextSteps", name: "Close & Next Steps", color: "red" },
];


export default async function TrainerDashboardPage() {
  const [session, trainerId] = await Promise.all([getSession(), getTrainerDbId()]);
  if (!trainerId || !session) return null;

  // Fetch trainer profile + all calls for this trainer + all calls for team avg
  const admin = createAdminClient();
  const { data: trainerProfile } = await admin
    .from("users")
    .select("name")
    .eq("id", session.user.id)
    .single();

  const [trainerCalls, allCalls] = await Promise.all([
    getCalls({ trainerId }),
    getCalls(),
  ]);

  const trainerName = trainerProfile?.name ?? "Trainer";

  // ── Métricas calculadas das calls reais ──────────────────────────────────
  const totalCalls = trainerCalls.length;
  const closedCalls    = trainerCalls.filter((c) => c.result === "closed").length;
  const followUpCalls  = trainerCalls.filter((c) => c.result === "follow_up").length;
  const objectionCalls = trainerCalls.filter((c) => c.result === "objection_unresolved").length;
  const noDecisionCalls = trainerCalls.filter((c) => c.result === "no_decision").length;

  const myScore = totalCalls > 0
    ? Math.round(trainerCalls.reduce((sum, c) => sum + c.score, 0) / totalCalls)
    : 0;
  const closeRate = totalCalls > 0 ? Math.round((closedCalls / totalCalls) * 100) : 0;

  const recentCalls = [...trainerCalls]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);

  // ── Rubric: trainer avg vs team avg (from real calls) ────────────────────
  const myRubric   = avgRubricScores(trainerCalls);
  const teamRubric = avgRubricScores(allCalls);

  const rubricWithDelta = RUBRIC_SECTIONS.map((s) => ({
    ...s,
    value:   myRubric[s.key],
    teamAvg: teamRubric[s.key],
    delta:   myRubric[s.key] - teamRubric[s.key],
  }));

  return (
    <div>
      {/* ── Greeting ──────────────────────────────────────────── */}
      <div className="mb-6">
        <SectionLabel>My Dashboard</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--am-text)" }}>
          Hello, {trainerName}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--am-muted)" }}>
          {totalCalls} calls analyzed
        </p>
      </div>

      {/* ── Personal metrics ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <ScoreCard label="My Score"   value={myScore}      valueColor="var(--am-accent2)" />
        <ScoreCard label="Close Rate" value={`${closeRate}%`} valueColor="var(--am-green)" />
      </div>

      {/* ── Main grid: rubric + coaching tip ──────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

        {/* Personal rubric vs team avg */}
        <div className="rounded-2xl p-5 border" style={{ background: "var(--card)", borderColor: "var(--am-border)" }}>
          <p className="text-[13px] font-medium mb-1" style={{ color: "var(--am-text)" }}>
            My Rubric vs Team Average
          </p>
          <p className="text-xs mb-4" style={{ color: "var(--am-muted)" }}>
            Green = above team avg · Red = below team avg
          </p>
          <div className="flex flex-col gap-4">
            {rubricWithDelta.map((row) => (
              <div key={row.key}>
                <RubricBar label={row.name} value={row.value} color={row.color} />
                <div className="flex justify-between mt-1 pl-[148px]">
                  <span
                    className="text-[10px] font-mono"
                    style={{ color: row.delta >= 0 ? "var(--am-green)" : "var(--am-red)" }}
                  >
                    {row.delta > 0 ? `+${row.delta}` : row.delta} vs team ({row.teamAvg})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Quick stats */}
          <div className="rounded-2xl p-5 border" style={{ background: "var(--card)", borderColor: "var(--am-border)" }}>
            <p className="text-[13px] font-medium mb-3" style={{ color: "var(--am-text)" }}>Quick Stats</p>
            <div className="grid grid-cols-2 gap-3 text-center">
              {[
                { label: "Closed",      value: closedCalls,      color: "var(--am-green)" },
                { label: "Follow-up",   value: followUpCalls,    color: "var(--am-amber)" },
                { label: "Objection",   value: objectionCalls,   color: "var(--am-amber)" },
                { label: "No Decision", value: noDecisionCalls,  color: "var(--am-red)" },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p className="text-2xl font-semibold font-mono" style={{ color }}>{value}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--am-muted)" }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent calls ──────────────────────────────────────── */}
      <SectionLabel>Recent Calls</SectionLabel>
      <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--am-border)" }}>
        {recentCalls.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: "var(--am-muted)" }}>No calls yet.</p>
        ) : recentCalls.map((call, i) => {
          const result = RESULT_STYLES[call.result] ?? DEFAULT_RESULT_STYLE;
          return (
            <Link
              key={call.id}
              href={`/me/calls/${call.id}`}
              className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--am-bg3)]"
              style={{ borderBottom: i < recentCalls.length - 1 ? "1px solid var(--am-border)" : "none" }}
            >
              <span className="text-xs font-mono w-20 flex-shrink-0" style={{ color: "var(--am-muted)" }}>
                {new Date(call.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              <span className="flex-1 text-sm truncate" style={{ color: "var(--am-text)" }}>{call.prospect}</span>
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded-full font-mono flex-shrink-0"
                style={{ background: result.bg, color: result.color }}
              >
                {result.label}
              </span>
              <ScorePill score={call.score} />
              <ChevronRight size={15} style={{ color: "var(--am-muted)", flexShrink: 0 }} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
