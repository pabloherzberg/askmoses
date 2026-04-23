'use client'

import { useTranslations } from 'next-intl'
import type { CoachingRec, CtaKey } from "@/lib/mock-data";

const ORDER_COLORS = [
  { bg: "#FF5E5E", text: "#fff" },
  { bg: "#5EB3FF", text: "#fff" },
  { bg: "#6E56FF", text: "#fff" },
];

// Palette keyed on the stable `ctaKey`, NOT on the translated label.
// Previously this map used the English label as the key, which caused every
// non-EN locale to silently fall back to DEFAULT_CTA once `cta` came back
// translated by the coaching-bundle LLM step.
const CTA_COLORS: Record<
  CtaKey,
  { color: string; border: string; bg: string }
> = {
  reference: {
    color: "var(--am-amber)",
    border: "rgba(255,171,46,0.4)",
    bg: "rgba(255,171,46,0.08)",
  },
  share: {
    color: "var(--am-green)",
    border: "rgba(34,217,160,0.4)",
    bg: "rgba(34,217,160,0.08)",
  },
  viewMissing: {
    color: "var(--am-accent2)",
    border: "rgba(155,135,255,0.4)",
    bg: "rgba(155,135,255,0.08)",
  },
  viewCalls: {
    color: "var(--am-blue)",
    border: "rgba(94,179,255,0.4)",
    bg: "rgba(94,179,255,0.08)",
  },
  viewScript: {
    color: "var(--am-muted)",
    border: "rgba(122,132,154,0.4)",
    bg: "rgba(122,132,154,0.08)",
  },
};

const DEFAULT_CTA = {
  color: "var(--am-muted)",
  border: "rgba(122,132,154,0.4)",
  bg: "rgba(122,132,154,0.08)",
};

interface CoachingRecommendationsProps {
  recs: CoachingRec[];
}

export function CoachingRecommendations({
  recs,
}: CoachingRecommendationsProps) {
  const t = useTranslations('Shared.coachingRecommendations')
  return (
    <div
      className="rounded-2xl p-5 border shadow-md"
      style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p
          className="text-[13px] font-medium"
          style={{ color: "var(--am-text)" }}
        >
          {t('title')}
        </p>
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
          style={{
            color: "var(--am-amber)",
            borderColor: "rgba(255,171,46,0.35)",
            background: "rgba(255,171,46,0.08)",
          }}
        >
          {t('mockBadge')}
        </span>
      </div>

      {/* Recommendations */}
      <div className="flex flex-col gap-3">
        {recs.map((rec) => {
          const badge = ORDER_COLORS[(rec.order - 1) % ORDER_COLORS.length];
          const cta = CTA_COLORS[rec.ctaKey] ?? DEFAULT_CTA;

          return (
            <div key={rec.order} className="flex items-start gap-3">
              {/* Order badge */}
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono font-bold flex-shrink-0 mt-0.5"
                style={{ background: badge.bg, color: badge.text }}
              >
                {rec.order}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p
                  className="text-[13px] font-semibold leading-snug"
                  style={{ color: "var(--am-text)" }}
                >
                  {rec.title}
                </p>
                <p
                  className="text-[12px] mt-0.5 leading-relaxed"
                  style={{ color: "var(--am-muted)" }}
                >
                  {rec.text}
                </p>
              </div>

              {/* CTA */}
              <button
                type="button"
                className="flex-shrink-0 text-[11px] font-mono px-2.5 py-1 rounded-lg border whitespace-nowrap cursor-default"
                style={{
                  color: cta.color,
                  borderColor: cta.border,
                  background: cta.bg,
                }}
              >
                {rec.cta}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="mt-4 text-[10px]" style={{ color: "var(--am-amber)" }}>
        {t('mockFooter')}
      </p>
    </div>
  );
}
