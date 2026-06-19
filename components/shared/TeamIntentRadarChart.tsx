"use client";

import { TrendingUp } from "lucide-react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { computeIntentIndex } from "@/lib/utils/intentScore";
import { deriveIntentBreakdownForCall } from "@/lib/services/intent";
import type { Call, IntentSignal } from "@/lib/types";

const SIGNAL_COLORS: Record<string, string> = {
  financial: "var(--am-red)",
  urgency: "var(--am-amber)",
  authority: "var(--am-blue)",
  engagement: "var(--am-accent2)",
};

interface TeamIntentRadarChartProps {
  trainerCalls: Call[];
  teamCalls: Call[];
  signals: IntentSignal[];
  trainerName: string;
  startDate: Date;
  endDate: Date;
}

function avgBreakdown(calls: Call[], signals: IntentSignal[]): Record<string, number> {
  if (calls.length === 0) return { financial: 0, urgency: 0, authority: 0, engagement: 0 };

  const toNum = (v: unknown): number => {
    if (typeof v === "number") return v;
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  const totals = { financial: 0, urgency: 0, authority: 0, engagement: 0 };
  for (const call of calls) {
    const bd =
      call.intentBreakdown && typeof call.intentBreakdown === "object"
        ? call.intentBreakdown
        : deriveIntentBreakdownForCall(call.score, signals);
    totals.financial += toNum(bd["financial"]);
    totals.urgency += toNum(bd["urgency"]);
    totals.authority += toNum(bd["authority"]);
    totals.engagement += toNum(bd["engagement"]);
  }
  const n = calls.length;
  return {
    financial: Math.round((totals.financial / n) * 10) / 10,
    urgency: Math.round((totals.urgency / n) * 10) / 10,
    authority: Math.round((totals.authority / n) * 10) / 10,
    engagement: Math.round((totals.engagement / n) * 10) / 10,
  };
}

function intentIndex(bd: Record<string, number>, signals: IntentSignal[]): number {
  return computeIntentIndex(bd, {
    financial: signals.find((s) => s.id === "financial")?.weight ?? 4,
    urgency: signals.find((s) => s.id === "urgency")?.weight ?? 3,
    authority: signals.find((s) => s.id === "authority")?.weight ?? 2,
    engagement: signals.find((s) => s.id === "engagement")?.weight ?? 1,
  });
}

const SIGNAL_LABELS: Record<string, string> = {
  financial: "Financial",
  urgency: "Urgency",
  authority: "Authority",
  engagement: "Engagement",
};

export function TeamIntentRadarChart({
  trainerCalls,
  teamCalls,
  signals,
  trainerName,
  startDate,
  endDate,
}: TeamIntentRadarChartProps) {
  const trainerBd = avgBreakdown(trainerCalls, signals);
  const teamBd = avgBreakdown(teamCalls, signals);

  const trainerIndex = intentIndex(trainerBd, signals);
  const teamIndex = intentIndex(teamBd, signals);
  const delta = Math.round((trainerIndex - teamIndex) * 10) / 10;

  const hasTeam = teamCalls.length > 0;

  // Calcular tendência (primeira metade vs segunda metade do período)
  let trendDelta = 0;
  const mid = new Date((startDate.getTime() + endDate.getTime()) / 2);
  const firstHalf = trainerCalls.filter((c) => new Date(c.date) < mid);
  const secondHalf = trainerCalls.filter((c) => new Date(c.date) >= mid);
  const firstBd = avgBreakdown(firstHalf, signals);
  const secondBd = avgBreakdown(secondHalf, signals);
  const firstIdx = intentIndex(firstBd, signals);
  const secondIdx = intentIndex(secondBd, signals);
  if (firstIdx > 0) {
    trendDelta = Math.round(((secondIdx - firstIdx) / firstIdx) * 1000) / 10;
  }

  const radarData = signals.map((signal) => {
    // breakdown está em 0–10; dividir por 2 para domain 0–5
    const trainerVal = (trainerBd[signal.id] ?? 0) / 2;
    const teamVal = (teamBd[signal.id] ?? 0) / 2;
    return {
      name: SIGNAL_LABELS[signal.id] ?? signal.id,
      trainer: trainerVal,
      team: hasTeam ? teamVal : undefined,
    };
  });

  const chartConfig: ChartConfig = {
    trainer: { label: trainerName, color: "var(--am-accent)" },
    team: { label: "Team avg", color: "var(--am-amber)" },
  };

  return (
    <div
      className="rounded-2xl p-5 border shadow-md"
      style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
    >
      {/* Header */}
      <div className="mb-4">
        <p className="text-[13px] font-medium" style={{ color: "var(--am-text)" }}>
          Buying Intent
        </p>
        <p className="text-[11px]" style={{ color: "var(--am-muted)" }}>
          {hasTeam
            ? `${trainerName} (${trainerIndex.toFixed(1)}) vs. team avg (${teamIndex.toFixed(1)})`
            : `${trainerName} — weighted score ${trainerIndex.toFixed(1)} / 5`}
        </p>
      </div>

      {/* Intent Index badge + delta */}
      <div className="flex items-center gap-3 mb-4">
        <div className="text-[22px] font-bold font-mono" style={{ color: "var(--am-green)" }}>
          {trainerIndex.toFixed(1)}
          <span className="text-[13px] font-normal ml-0.5" style={{ color: "var(--am-muted)" }}>
            /5
          </span>
        </div>
        {hasTeam && (
          <span
            className="text-[12px] font-mono font-medium px-2 py-0.5 rounded-full"
            style={{
              background: delta >= 0 ? "rgba(34,217,160,0.12)" : "rgba(255,94,94,0.12)",
              color: delta >= 0 ? "var(--am-green)" : "var(--am-red)",
            }}
          >
            {delta >= 0 ? "+" : ""}{delta} vs team
          </span>
        )}
      </div>

      {/* Radar */}
      <div style={{ width: "100%", height: 300 }}>
        <ChartContainer config={chartConfig} className="w-full h-full">
          <RadarChart data={radarData} margin={{ top: 24, right: 90, bottom: 24, left: 90 }}>
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
            <PolarGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
            <PolarAngleAxis
              dataKey="name"
              tick={({ x, y, payload, cx, cy }) => {
                const dx = x > cx ? 6 : x < cx ? -6 : 0;
                const dy = y > cy ? 4 : y < cy ? -4 : 4;
                const signalId = signals.find(
                  (s) => (SIGNAL_LABELS[s.id] ?? s.id) === payload.value
                )?.id;
                const color = signalId ? SIGNAL_COLORS[signalId] : "var(--am-muted)";
                const entry = radarData.find((d) => d.name === payload.value);
                const numVal = entry?.trainer;
                return (
                  <g>
                    <text x={x + dx} y={y + dy - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={color}>
                      {payload.value}
                    </text>
                    {numVal !== undefined && (
                      <text x={x + dx} y={y + dy + 8} textAnchor="middle" fontSize={10} fontFamily="DM Mono, monospace" fill="var(--am-text)">
                        {numVal.toFixed(1)}
                      </text>
                    )}
                  </g>
                );
              }}
            />
            <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: "var(--am-muted)", fontSize: 8 }} tickCount={6} stroke="transparent" />
            <Radar
              name={trainerName}
              dataKey="trainer"
              fill="var(--color-trainer)"
              fillOpacity={0.45}
              stroke="var(--color-trainer)"
              strokeWidth={2}
              isAnimationActive={false}
            />
            {hasTeam && (
              <Radar
                name="Team avg"
                dataKey="team"
                fill="var(--color-team)"
                fillOpacity={0.15}
                stroke="var(--color-team)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                isAnimationActive={false}
              />
            )}
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          </RadarChart>
        </ChartContainer>
      </div>

      {/* Footer trend */}
      <div className="mt-4 flex flex-col gap-2 text-sm">
        <div
          className="flex items-center gap-2 leading-none font-medium"
          style={{
            color: trendDelta > 0 ? "var(--am-green)" : trendDelta < 0 ? "var(--am-red)" : "var(--am-muted)",
          }}
        >
          {trendDelta > 0 ? "Intent growing" : trendDelta < 0 ? "Intent declining" : "Intent stable"}{" "}
          {Math.abs(trendDelta)}% this period
          {trendDelta !== 0 && (
            <TrendingUp className="h-4 w-4" style={{ transform: trendDelta < 0 ? "scaleY(-1)" : "" }} />
          )}
        </div>
        <div className="flex items-center gap-2 leading-none text-muted-foreground">
          {startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} -{" "}
          {endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
      </div>
    </div>
  );
}
