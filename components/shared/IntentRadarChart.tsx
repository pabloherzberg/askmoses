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
import type { Call, IntentSignal } from "@/lib/types";

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
    if (call.intentBreakdown && typeof call.intentBreakdown === "object") {
      totals.urgency += toNum(call.intentBreakdown["urgency"]);
      totals.authority += toNum(call.intentBreakdown["authority"]);
      totals.financial += toNum(call.intentBreakdown["financial"]);
      totals.engagement += toNum(call.intentBreakdown["engagement"]);
      validCount++;
    }
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
  const weights = {
    financial: signals.find((s) => s.id === "financial")?.weight || 4,
    urgency: signals.find((s) => s.id === "urgency")?.weight || 3,
    authority: signals.find((s) => s.id === "authority")?.weight || 2,
    engagement: signals.find((s) => s.id === "engagement")?.weight || 1,
  };
  return computeIntentIndex(breakdown, weights);
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
  const breakdown = calculateIntentBreakdown(calls, signals);
  const intentIndex = getIntentIndex(breakdown, signals);
  const intentDisplay = (Math.round(intentIndex * 10) / 10).toFixed(1);

  // Fonte única da decisão "tem comparação com o time?". Usada em TODOS os
  // pontos (dados, config, subtítulo, render) — antes uns usavam `teamCalls`
  // (array vazio é truthy!) e outros `teamCalls.length > 0`, o que gerava
  // radarData com chaves trainer/team enquanto o <Radar> lia "value" → zerava.
  const hasTeam = !!(teamCalls && teamCalls.length > 0);

  // Calculate delta (first half vs. second half of period)
  let trendDelta = 0;
  if (startDate && endDate) {
    const midDate = new Date((startDate.getTime() + endDate.getTime()) / 2);
    const firstHalf = calls.filter((c) => new Date(c.date) < midDate);
    const secondHalf = calls.filter((c) => new Date(c.date) >= midDate);

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
        ? "Financeiro"
        : signal.id === "urgency"
          ? "Urgência"
          : signal.id === "authority"
            ? "Autoridade"
            : signal.id === "engagement"
              ? "Engajamento"
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
        trainer: { label: trainerName || "Trainer", color: "var(--am-accent)" },
        team: { label: "Média do time", color: "var(--am-accent2)" },
      }
    : {
        value: { label: "Intent", color: "var(--am-blue)" },
      };

  const subtitle = hasTeam
    ? `${trainerName} (${intentDisplay}) vs. média do time (${teamIntentDisplay})`
    : `Média do time — nota ponderada ${intentDisplay} / 5`;

  // 🔍 DIAGNÓSTICO TEMPORÁRIO — remover após confirmar consistência.
  // Mostra o que chega de trainer e time + o array final que vai pro <Radar>.
  if (typeof window !== "undefined") {
    console.log("[IntentRadar]", {
      trainerName,
      hasTeam,
      qtdCallsTrainer: calls.length,
      qtdCallsTime: teamCalls?.length ?? 0,
      callsComBreakdown: calls.filter(
        (c) => c.intentBreakdown && typeof c.intentBreakdown === "object",
      ).length,
      breakdownTrainer: breakdown,
      breakdownTime: teamBreakdown,
      intentIndexTrainer: intentIndex,
      intentIndexTime: teamIntentIndex,
    });
    // eslint-disable-next-line no-console
    console.table(radarData);
  }

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
          Intenção de compra
        </p>
        <p className="text-[11px]" style={{ color: "var(--am-muted)" }}>
          {subtitle}
        </p>
      </div>

      {/* Radar Chart */}
      <div
        style={{ width: "100%", height: variant === "detailed" ? 350 : 280 }}
      >
        <ChartContainer config={chartConfig} className="w-full h-full">
          <RadarChart
            data={radarData}
            margin={{ top: 20, right: 80, bottom: 20, left: 80 }}
          >
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <PolarAngleAxis
              dataKey="name"
              tick={{ fill: "var(--am-muted)", fontSize: 11 }}
            />
            <PolarGrid stroke="var(--am-border)" />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 5]}
              tick={{ fill: "var(--am-muted)", fontSize: 9 }}
            />
            {hasTeam ? (
              <>
                <Radar
                  name="Trainer"
                  dataKey="trainer"
                  fill="var(--color-trainer)"
                  fillOpacity={0.6}
                  stroke="var(--color-trainer)"
                  isAnimationActive={false}
                />
                <Radar
                  name="Team"
                  dataKey="team"
                  fill="var(--color-team)"
                  fillOpacity={0.3}
                  stroke="var(--color-team)"
                  isAnimationActive={false}
                />
                <Legend />
              </>
            ) : (
              <Radar
                name="Intent"
                dataKey="value"
                fill="var(--color-value)"
                fillOpacity={0.25}
                stroke="var(--color-value)"
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
            ? "Intenção crescendo"
            : trendDelta < 0
              ? "Intenção caindo"
              : "Intenção estável"}{" "}
          {Math.abs(trendDelta)}% este período
          {trendDelta !== 0 && (
            <TrendingUp
              className="h-4 w-4"
              style={{ transform: trendDelta < 0 ? "scaleY(-1)" : "" }}
            />
          )}
        </div>
        {startDate && endDate && (
          <div className="flex items-center gap-2 leading-none text-muted-foreground">
            {startDate.toLocaleDateString("pt-BR", {
              month: "short",
              day: "numeric",
            })}{" "}
            -{" "}
            {endDate.toLocaleDateString("pt-BR", {
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
