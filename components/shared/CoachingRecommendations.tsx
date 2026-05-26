'use client'

import { useMemo, useState } from "react";
import { Send, Check, Sparkles, RotateCcw, Bell, Mail, AlertTriangle } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import type { CoachingRec } from "@/lib/mock-data";

interface CoachingRecommendationsProps {
  /** Pontos analisados pela IA — unidos num único rascunho editável. */
  recs: CoachingRec[];
  /** ID do trainer destinatário (trainers.id) — usado no envio. */
  trainerId: string;
  /** Sales person que recebe a recomendação — exibido na UI. */
  trainerName: string;
}

type Phase = "edit" | "sending" | "sent";

type EmailDelivery = "sent" | "mocked" | "skipped" | "failed";

interface Delivery {
  inApp: boolean;
  email: EmailDelivery;
}

/**
 * Painel de recomendação de coaching. A IA reúne os pontos analisados nas
 * calls do trainer numa ÚNICA recomendação; o owner edita o texto livremente
 * — tirando o que discorda, acrescentando detalhes — e envia.
 *
 * O envio cria uma notificação real (POST /api/coaching/notifications). A
 * entrega faz fan-out pros canais ativos do trainer (sino in-app / email),
 * configuráveis por ele em /me/settings — a resposta informa o que foi usado.
 */
export function CoachingRecommendations({ recs, trainerId, trainerName }: CoachingRecommendationsProps) {
  const t = useTranslations("Coaching");
  const locale = useLocale();
  const firstName = trainerName.split(" ")[0];

  // Rascunho inicial: une os pontos da IA num texto único e editável.
  const draft = useMemo(() => {
    const intro = t("draftIntro", { name: firstName });
    const points = recs
      .map((r, i) => `${i + 1}. ${r.title}\n${r.text}`)
      .join("\n\n");
    return points ? `${intro}\n\n${points}` : intro;
  }, [recs, firstName, t]);

  const [text, setText] = useState(draft);
  const [phase, setPhase] = useState<Phase>("edit");
  const [error, setError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);

  const handleSend = async () => {
    if (phase === "sending") return;
    const body = text.trim();
    if (!body) {
      setError(t("recsEmptyError"));
      return;
    }
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/coaching/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-locale": locale },
        body: JSON.stringify({
          recipientId: trainerId,
          title: t("recsNotificationTitle"),
          body,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.error) {
        setError(json?.error?.message ?? t("recsError"));
        setPhase("edit");
        return;
      }
      setDelivery(json?.data?.delivery ?? { inApp: true, email: "skipped" });
      setPhase("sent");
    } catch {
      setError(t("recsError"));
      setPhase("edit");
    }
  };

  const handleReset = () => {
    setText(draft);
    setError(null);
  };

  const handleSendAnother = () => {
    setText(draft);
    setError(null);
    setDelivery(null);
    setPhase("edit");
  };

  const inAppDelivered = delivery?.inApp === true;
  const emailDelivered = delivery?.email === "sent" || delivery?.email === "mocked";
  const emailFailed = delivery?.email === "failed";
  const anyDelivered = inAppDelivered || emailDelivered;

  return (
    <div
      className="rounded-2xl p-5 border shadow-md"
      style={{ background: "var(--card)", borderColor: "var(--am-border)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={14} style={{ color: "var(--am-accent2)" }} />
        <p
          className="text-[11px] font-semibold tracking-widest uppercase"
          style={{ color: "var(--am-muted)" }}
        >
          {t("recsTitle")}
        </p>
      </div>

      {phase === "sent" ? (
        /* ── Estado enviado ──────────────────────────────────── */
        <div className="flex flex-col items-center text-center gap-3 py-8">
          <span
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{
              background: "var(--am-green-bg, rgba(34,217,160,0.12))",
              color: "var(--am-green)",
            }}
          >
            <Check size={24} />
          </span>
          <p className="text-sm font-semibold" style={{ color: "var(--am-text)" }}>
            {t("recsSentTitle")}
          </p>

          {anyDelivered ? (
            <>
              <p className="text-xs" style={{ color: "var(--am-muted)" }}>
                {t("recsDeliveredVia", { name: firstName })}
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {inAppDelivered && (
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium"
                    style={{ background: "var(--am-bg3)", color: "var(--am-text)" }}
                  >
                    <Bell size={12} style={{ color: "var(--am-green)" }} />
                    {t("recsChannelInApp")}
                  </span>
                )}
                {emailDelivered && (
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium"
                    style={{ background: "var(--am-bg3)", color: "var(--am-text)" }}
                  >
                    <Mail size={12} style={{ color: "var(--am-green)" }} />
                    {t("recsChannelEmail")}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[12px] leading-relaxed text-left"
              style={{
                background: "var(--am-amber-bg, rgba(255,171,46,0.12))",
                color: "var(--am-amber)",
              }}
            >
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{t("recsNoChannels", { name: firstName })}</span>
            </div>
          )}

          {emailFailed && (
            <p className="text-[11px]" style={{ color: "var(--am-muted)" }}>
              {t("recsEmailFailed")}
            </p>
          )}

          <button
            type="button"
            onClick={handleSendAnother}
            className="text-[12px] font-medium mt-1 transition-opacity hover:opacity-80"
            style={{ color: "var(--am-accent2)" }}
          >
            {t("recsSendAnother")}
          </button>
        </div>
      ) : (
        /* ── Editor da recomendação unificada ────────────────── */
        <>
          <p
            className="text-[12px] leading-relaxed mb-3"
            style={{ color: "var(--am-muted)" }}
          >
            {t("recsHint", { name: firstName })}
          </p>

          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            disabled={phase === "sending"}
            placeholder={t("recsPlaceholder")}
            rows={12}
            className="w-full rounded-xl p-4 text-[13px] leading-relaxed resize-y transition-opacity disabled:opacity-60"
            style={{
              background: "var(--am-bg3)",
              border: "1px solid var(--am-border)",
              color: "var(--am-text)",
              minHeight: 240,
            }}
          />

          {error && (
            <p
              role="alert"
              className="text-xs mt-2 px-3 py-2 rounded-md border"
              style={{
                background: "var(--am-red-bg)",
                borderColor: "var(--am-red)",
                color: "var(--am-red)",
              }}
            >
              {error}
            </p>
          )}

          {/* Footer: reset + send */}
          <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
            <button
              type="button"
              onClick={handleReset}
              disabled={phase === "sending" || text === draft}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
              style={{ color: "var(--am-muted)" }}
            >
              <RotateCcw size={12} />
              {t("recsReset")}
            </button>

            <button
              type="button"
              onClick={handleSend}
              disabled={phase === "sending"}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium px-4 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: "var(--am-accent)", color: "var(--am-on-accent)" }}
            >
              <Send size={13} />
              {phase === "sending"
                ? t("recsSending")
                : t("recsSend", { name: firstName })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
