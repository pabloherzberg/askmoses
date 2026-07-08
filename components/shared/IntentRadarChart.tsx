"use client";

import { useTranslations } from "next-intl";
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
import { computeIntentIndex, resolveIntentWeights } from "@/lib/utils/intentScore";
import { deriveIntentBreakdownForCall } from "@/lib/services/intent";
import type { Call, IntentSignal } from "@/lib/types";

const SIGNAL_COLORS: Record<string, string> = {
  financial: "var(--am-red)",
  urgency: "var(--am-amber)",
  authority: "var(--am-blue)",
  engagement: "var(--am-accent2)",
};

interface IntentRadarChartProps {
  calls: Call[];
  signals: IntentSignal[];
  teamCalls?: Call[];
  trainerName?: string;
  startDate?: Date;
  endDate?: Date;
  variant?: "compact" | "detailed" | "dashboard" | "teamcommandcenter";
}

function calculateIntentBreakdown(
  calls: Call[],
  signals: IntentSignal[],
): Record<string, number> {
  if (calls.length === 0) {
    return { urgency: 0, authority: 0, financial: 0, engagement: 0 };
  }

  const totals = { urgency: 0, authority: 0, financial: 0, engagement: 0 };
  let validCount = 0;

  // Coerção defensiva: JSONB do Postgres traz números, mas blinda contra
  // valores que chegassem como string ("2,9"/"2.9") e quebrassem o Recharts.
  const toNum = (v: unknown): number => {
    if (typeof v === "number") return v;
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  calls.forEach((call) => {
    const bd =
      call.intentBreakdown && typeof call.intentBreakdown === "object"
        ? call.intentBreakdown
        : deriveIntentBreakdownForCall(call.score, signals);
    totals.urgency += toNum(bd["urgency"]);
    totals.authority += toNum(bd["authority"]);
    totals.financial += toNum(bd["financial"]);
    totals.engagement += toNum(bd["engagement"]);
    validCount++;
  });

  if (validCount === 0) {
    return { urgency: 0, authority: 0, financial: 0, engagement: 0 };
  }

  return {
    urgency: Math.round((totals.urgency / validCount) * 10) / 10,
    authority: Math.round((totals.authority / validCount) * 10) / 10,
    financial: Math.round((totals.financial / validCount) * 10) / 10,
    engagement: Math.round((totals.engagement / validCount) * 10) / 10,
  };
}

function getIntentIndex(
  breakdown: Record<string, number>,
  signals: IntentSignal[],
): number {
  return computeIntentIndex(breakdown, resolveIntentWeights(signals));
}

export function IntentRadarChart({
  calls,
  signals,
  teamCalls,
  trainerName,
  startDate,
  endDate,
  variant = "compact",
}: IntentRadarChartProps) {
  const t = useTranslations("Intent");
  const breakdown = calculateIntentBreakdown(calls, signals);
  const intentIndex = getIntentIndex(breakdown, signals);
  const intentDisplay = (Math.round(intentIndex * 10) / 10).toFixed(1);

  // Fonte única da decisão "tem comparação com o time?". Usada em TODOS os
  // pontos (dados, config, subtítulo, render) — antes uns usavam `teamCalls`
  // (array vazio é truthy!) e outros `teamCalls.length > 0`, o que gerava
  // radarData com chaves trainer/team enquanto o <Radar> lia "value" → zerava.
  const hasTeam = !!(teamCalls && teamCalls.length > 0);

  // Calculate delta (first half vs. second half) usando as datas reais das calls.
  // Divide pelo ponto médio entre a call mais antiga e a mais recente — assim
  // o trend só aparece quando há calls nas duas metades do intervalo real.
  let trendDelta = 0;
  if (calls.length >= 2) {
    const timestamps = calls.map((c) => new Date(c.date).getTime()).sort((a, b) => a - b);
    const realMid = (timestamps[0] + timestamps[timestamps.length - 1]) / 2;

    const firstHalf = calls.filter((c) => new Date(c.date).getTime() <= realMid);
    const secondHalf = calls.filter((c) => new Date(c.date).getTime() > realMid);

    // Só calcula se houver calls nas duas metades
    if (firstHalf.length > 0 && secondHalf.length > 0) {
      const firstHalfBreakdown = calculateIntentBreakdown(firstHalf, signals);
      const secondHalfBreakdown = calculateIntentBreakdown(secondHalf, signals);

      const firstHalfIndex = getIntentIndex(firstHalfBreakdown, signals);
      const secondHalfIndex = getIntentIndex(secondHalfBreakdown, signals);

      trendDelta =
        firstHalfIndex > 0
          ? Math.round(
              ((secondHalfIndex - firstHalfIndex) / firstHalfIndex) * 1000,
            ) / 10
          : 0;
    }
  }

  // For team comparison (trainer view)
  const teamBreakdown = hasTeam
    ? calculateIntentBreakdown(teamCalls!, signals)
    : null;
  const teamIntentIndex = teamBreakdown
    ? getIntentIndex(teamBreakdown, signals)
    : null;
  const teamIntentDisplay = teamIntentIndex
    ? (Math.round(teamIntentIndex * 10) / 10).toFixed(1)
    : null;
  const delta = teamIntentIndex
    ? Math.round((intentIndex - teamIntentIndex) * 10) / 10
    : null;

  // Prepare radar data
  const radarData = signals.map((signal) => {
    const signalName =
      signal.id === "financial"
        ? "Financial"
        : signal.id === "urgency"
          ? "Urgency"
          : signal.id === "authority"
            ? "Authority"
            : signal.id === "engagement"
              ? "Engagement"
              : signal.id;

    const trainerValue = (breakdown[signal.id] ?? 0) / 2;
    const teamValue = teamBreakdown
      ? (teamBreakdown[signal.id] ?? 0) / 2
      : undefined;

    return {
      name: signalName,
      ...(hasTeam
        ? { trainer: trainerValue, team: teamValue }
        : { value: trainerValue }),
    };
  });

  const chartConfig: ChartConfig = hasTeam
    ? {
        trainer: { label: trainerName || t("callTrainer"), color: "var(--am-accent)" },
        team: { label: t("teamAverage"), color: "var(--am-accent2)" },
      }
    : {
        value: { label: "Intent", color: "var(--am-blue)" },
      };

  const subtitle = hasTeam
    ? `${trainerName} (${intentDisplay}) vs. team avg (${teamIntentDisplay})`
    : `Team average — weighted score ${intentDisplay} / 5`;

  return (
    <div
      className="rounded-2xl p-5 border shadow-md"
      style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
    >
      {/* Header */}
      <div className="mb-4">
        <p
          className="text-[13px] font-medium"
          style={{ color: "var(--am-text)" }}
        >
          Buying Intent
        </p>
        <p className="text-[11px]" style={{ color: "var(--am-muted)" }}>
          {subtitle}
        </p>
      </div>

      {/* Intent Index badge */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="px-3 py-1 rounded-full text-[22px] font-bold font-mono"
          style={{ color: "var(--am-green)" }}
        >
          {intentDisplay}
          <span className="text-[13px] font-normal ml-0.5" style={{ color: "var(--am-muted)" }}>
            /5
          </span>
        </div>
        {hasTeam && delta !== null && (
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

      {/* Radar Chart */}
      <div
        style={{ width: "100%", height: variant === "detailed" ? 350 : 300 }}
      >
        <ChartContainer config={chartConfig} className="w-full h-full">
          <RadarChart
            data={radarData}
            margin={{ top: 24, right: 90, bottom: 24, left: 90 }}
          >
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <PolarGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
            <PolarAngleAxis
              dataKey="name"
              tick={({ x, y, payload, cx, cy }) => {
                const dx = x > cx ? 6 : x < cx ? -6 : 0;
                const dy = y > cy ? 4 : y < cy ? -4 : 4;
                const signalId = radarData.find(d => d.name === payload.value)
                  ? signals.find(s =>
                      (s.id === "financial" && payload.value === "Financial") ||
                      (s.id === "urgency" && payload.value === "Urgency") ||
                      (s.id === "authority" && payload.value === "Authority") ||
                      (s.id === "engagement" && payload.value === "Engagement")
                    )?.id
                  : undefined;
                const color = signalId ? SIGNAL_COLORS[signalId] : "var(--am-muted)";
                const val = radarData.find(d => d.name === payload.value);
                const numVal = val ? (hasTeam ? (val as { name: string; trainer?: number }).trainer : (val as { name: string; value?: number }).value) : undefined;
                return (
                  <g>
                    <text
                      x={x + dx}
                      y={y + dy - 6}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill={color}
                    >
                      {payload.value}
                    </text>
                    {numVal !== undefined && (
                      <text
                        x={x + dx}
                        y={y + dy + 8}
                        textAnchor="middle"
                        fontSize={10}
                        fontFamily="DM Mono, monospace"
                        fill="var(--am-text)"
                      >
                        {numVal.toFixed(1)}
                      </text>
                    )}
                  </g>
                );
              }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 5]}
              tick={{ fill: "var(--am-muted)", fontSize: 8 }}
              tickCount={6}
              stroke="transparent"
            />
            {hasTeam ? (
              <>
                <Radar
                  name={trainerName || t("callTrainer")}
                  dataKey="trainer"
                  fill="var(--color-trainer)"
                  fillOpacity={0.45}
                  stroke="var(--color-trainer)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Radar
                  name={t("teamAverage")}
                  dataKey="team"
                  fill="var(--color-team)"
                  fillOpacity={0.15}
                  stroke="var(--color-team)"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  isAnimationActive={false}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                />
              </>
            ) : (
              <Radar
                name="Intent"
                dataKey="value"
                fill="var(--color-value)"
                fillOpacity={0.35}
                stroke="var(--color-value)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            )}
          </RadarChart>
        </ChartContainer>
      </div>

      {/* Footer with trend */}
      <div className="mt-4 flex flex-col gap-2 text-sm">
        <div
          className="flex items-center gap-2 leading-none font-medium"
          style={{
            color:
              trendDelta > 0
                ? "var(--am-green)"
                : trendDelta < 0
                  ? "var(--am-red)"
                  : "var(--am-muted)",
          }}
        >
          {trendDelta > 0
            ? "Intent growing"
            : trendDelta < 0
              ? "Intent declining"
              : "Intent stable"}{" "}
          {Math.abs(trendDelta)}% this period
          {trendDelta !== 0 && (
            <TrendingUp
              className="h-4 w-4"
              style={{ transform: trendDelta < 0 ? "scaleY(-1)" : "" }}
            />
          )}
        </div>
        {startDate && endDate && (
          <div className="flex items-center gap-2 leading-none text-muted-foreground">
            {startDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}{" "}
            -{" "}
            {endDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        )}
      </div>
    </div>
  );
}
