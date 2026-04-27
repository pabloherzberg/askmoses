'use client'

import type { CoachingRec } from "@/lib/mock-data";

interface CoachingRecommendationsProps {
  recs: CoachingRec[];
}

export function CoachingRecommendations({ recs }: CoachingRecommendationsProps) {
  return (
    <div
      className="rounded-2xl p-5 border shadow-md"
      style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
    >
      {/* Header */}
      <p
        className="text-[11px] font-semibold tracking-widest uppercase mb-4"
        style={{ color: "var(--am-muted)" }}
      >
        AI Coaching Recommendations
      </p>

      {/* Recommendations */}
      <div className="flex flex-col gap-3">
        {recs.map((rec) => (
          <div
            key={rec.order}
            className="flex items-start gap-3 rounded-xl p-3"
            style={{ background: "var(--am-bg3)" }}
          >
            {/* Order badge — solid green circle */}
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono font-bold flex-shrink-0 mt-0.5"
              style={{ background: "var(--am-green)", color: "#fff" }}
            >
              {rec.order}
            </span>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p
                className="text-[12px] font-semibold leading-snug mb-0.5"
                style={{ color: "var(--am-text)" }}
              >
                {rec.title}
              </p>
              <p
                className="text-[12px] leading-relaxed mb-1.5"
                style={{ color: "var(--am-text)", opacity: 0.8 }}
              >
                {rec.text}
              </p>
              {/* CTA as plain link */}
              <span
                className="text-[11px] font-medium cursor-default"
                style={{ color: "var(--am-green)" }}
              >
                {rec.cta} →
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
