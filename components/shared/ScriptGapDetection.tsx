"use client"

import { useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Check } from "lucide-react"
import type { ScriptGap } from "@/lib/types"
import { AcceptGapModal } from "@/components/shared/AcceptGapModal"

function FreqBadge({ value }: { value: number }) {
  const color =
    value >= 60 ? "var(--am-red)" : value >= 45 ? "var(--am-amber)" : "var(--am-muted)"
  const bg =
    value >= 60
      ? "rgba(255,94,94,0.12)"
      : value >= 45
        ? "rgba(255,171,46,0.12)"
        : "rgba(122,132,154,0.12)"
  return (
    <span
      className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full"
      style={{ color, background: bg }}
    >
      {value}%
    </span>
  )
}

function SeverityBadge({
  severity,
  t,
}: {
  severity: ScriptGap["severity"]
  t: ReturnType<typeof useTranslations>
}) {
  const styles: Record<ScriptGap["severity"], { bg: string; color: string; icon: string }> = {
    high: { bg: "rgba(255,94,94,0.15)", color: "var(--am-red)", icon: "▲" },
    medium: { bg: "rgba(255,171,46,0.15)", color: "var(--am-amber)", icon: "⚠" },
    low: { bg: "rgba(122,132,154,0.18)", color: "var(--am-muted)", icon: "•" },
  }
  const s = styles[severity]
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {s.icon} {t(`severity.${severity}`)}
    </span>
  )
}

interface Props {
  gaps: ScriptGap[]
  analyzedAt: string | null
  callsAnalyzed: string[]
}

export function ScriptGapDetection({ gaps, analyzedAt, callsAnalyzed }: Props) {
  const t = useTranslations("Shared.scriptGapDetection")
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set())
  const [activeGap, setActiveGap] = useState<ScriptGap | null>(null)

  const handleAccepted = useCallback((gapId: string) => {
    setAcceptedIds((prev) => new Set(prev).add(gapId))
  }, [])

  const lastAnalysis = analyzedAt
    ? new Date(analyzedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null

  const hasGaps = gaps.length > 0

  return (
    <div
      className="rounded-2xl p-5 border shadow-md"
      style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <p className="text-[13px] font-medium" style={{ color: "var(--am-text)" }}>
            {t("title")}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--am-muted)" }}>
            {lastAnalysis ? t("lastAnalysis", { date: lastAnalysis }) : t("neverRun")}
          </p>
        </div>
        {hasGaps && (
          <span
            className="inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-full"
            style={{ background: "var(--am-bg4)", color: "var(--am-muted)" }}
          >
            {t("callsAnalyzed", { count: callsAnalyzed.length })}
          </span>
        )}
      </div>

      {!hasGaps && (
        <p className="text-[12px] py-6 text-center" style={{ color: "var(--am-muted)" }}>
          {t("empty")}
        </p>
      )}

      {/* Grid — headers + rows share the same column template */}
      {hasGaps && (
      <div
        className="grid gap-x-3 px-1"
        style={{ gridTemplateColumns: "10rem 3.5rem 6rem 1fr" }}
      >
        {/* Column headers */}
        {(["section", "frequency", "severity", "gap"] as const).map((k) => (
          <span
            key={k}
            className="text-[10px] font-medium mb-2 uppercase tracking-wide"
            style={{ color: "var(--am-muted)" }}
          >
            {t(`th.${k}`)}
          </span>
        ))}

        {/* Rows */}
        {gaps.map((gap, i) => {
          const accepted = acceptedIds.has(gap.id)
          const border = i > 0 ? "1px solid var(--am-border)" : "none"
          return (
            <div key={gap.id} className="contents">
              {/* Section */}
              <div className="flex items-start py-3" style={{ borderTop: border }}>
                <span className="text-[12px] font-medium" style={{ color: "var(--am-text)" }}>
                  {gap.section}
                </span>
              </div>

              {/* Frequency */}
              <div className="flex items-start py-3" style={{ borderTop: border }}>
                <FreqBadge value={gap.frequency} />
              </div>

              {/* Severity */}
              <div className="flex items-start py-3" style={{ borderTop: border }}>
                <SeverityBadge severity={gap.severity} t={t} />
              </div>

              {/* Gap (instrução vs padrão observado) + Accept */}
              <div
                className="flex items-start py-3 gap-3 flex-wrap justify-between"
                style={{ borderTop: border }}
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div>
                    <span
                      className="text-[10px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--am-muted)" }}
                    >
                      {t("scriptInstructs")}
                    </span>
                    <p className="text-[12px]" style={{ color: "var(--am-text)" }}>
                      {gap.scriptInstruction}
                    </p>
                  </div>
                  <div>
                    <span
                      className="text-[10px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--am-muted)" }}
                    >
                      {t("observed")}
                    </span>
                    <p className="text-[12px]" style={{ color: "var(--am-text)" }}>
                      {gap.observedPattern}
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  {accepted ? (
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg"
                      style={{ background: "rgba(34,217,160,0.15)", color: "var(--am-green)" }}
                    >
                      <Check size={13} /> {t("accepted")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveGap(gap)}
                      className="text-[11px] font-mono px-2.5 py-1 rounded-lg border cursor-pointer"
                      style={{
                        color: "var(--am-accent2)",
                        borderColor: "rgba(155,135,255,0.35)",
                        background: "rgba(110,86,255,0.08)",
                      }}
                    >
                      {t("acceptGap")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      )}

      {activeGap && (
        <AcceptGapModal
          gap={activeGap}
          onClose={() => setActiveGap(null)}
          onAccepted={handleAccepted}
        />
      )}
    </div>
  )
}
