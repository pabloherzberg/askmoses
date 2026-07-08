"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  monthLabel: string;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
}

// Seletor de mês do Bloco 2 (mês-calendário). Controla SÓ o Bloco 2.
export function MonthSelector({ monthLabel, onPrev, onNext, disabled }: Props) {
  const t = useTranslations("Billing");
  return (
    <div
      className="inline-flex items-center gap-2 rounded-xl px-3 py-2"
      style={{ background: "var(--am-bg2)", border: "1px solid var(--am-border)" }}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={disabled}
        aria-label={t("prevMonth")}
        className="inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors disabled:opacity-40 hover:opacity-80"
        style={{ color: "var(--am-muted)" }}
      >
        <ChevronLeft size={16} />
      </button>
      <span
        className="text-[14px] font-medium min-w-[88px] text-center"
        style={{ color: "var(--am-text)" }}
      >
        {monthLabel}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        aria-label={t("nextMonth")}
        className="inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors disabled:opacity-40 hover:opacity-80"
        style={{ color: "var(--am-muted)" }}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
