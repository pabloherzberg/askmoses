'use client'

import { useState } from "react";
import { Send, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CoachingRec } from "@/lib/mock-data";
import { CoachingReviewModal } from "@/components/shared/CoachingReviewModal";

interface CoachingRecommendationsProps {
  recs: CoachingRec[];
  /** Sales person que recebe as recomendações — exibido no modal de revisão. */
  trainerName: string;
}

export function CoachingRecommendations({ recs, trainerName }: CoachingRecommendationsProps) {
  const t = useTranslations("Coaching");
  const [activeRec, setActiveRec] = useState<CoachingRec | null>(null);
  // Recomendações já enviadas — estado de demo em memória (sem persistência).
  const [sentOrders, setSentOrders] = useState<Set<number>>(new Set());

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
        {t("recsTitle")}
      </p>

      {/* Recommendations */}
      <div className="flex flex-col gap-3">
        {recs.map((rec) => {
          const sent = sentOrders.has(rec.order);
          return (
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

                {/* Footer: CTA + review-and-send action */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span
                    className="text-[11px] font-medium cursor-default"
                    style={{ color: "var(--am-green)" }}
                  >
                    {rec.cta} →
                  </span>

                  {sent ? (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-medium"
                      style={{ color: "var(--am-green)" }}
                    >
                      <Check size={12} />
                      {t("recsSentBadge")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveRec(rec)}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-opacity hover:opacity-80"
                      style={{
                        borderColor: "var(--am-border)",
                        background: "var(--am-bg2)",
                        color: "var(--am-accent2)",
                      }}
                    >
                      <Send size={11} />
                      {t("recsReview")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <CoachingReviewModal
        open={activeRec !== null}
        rec={activeRec}
        trainerName={trainerName}
        onClose={() => setActiveRec(null)}
        onSent={(order) =>
          setSentOrders((prev) => {
            const next = new Set(prev);
            next.add(order);
            return next;
          })
        }
      />
    </div>
  );
}
