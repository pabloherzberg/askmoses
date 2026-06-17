"use client";

import type { BillingPeriodRange } from "@/lib/types";

const RANGES: { value: BillingPeriodRange; label: string }[] = [
  { value: "1w", label: "1 week" },
  { value: "2w", label: "2 weeks" },
  { value: "3w", label: "3 weeks" },
  { value: "1m", label: "1 month" },
];

interface Props {
  value: BillingPeriodRange;
  onChange: (range: BillingPeriodRange) => void;
  disabled?: boolean;
}

// Seletor de presets do Bloco 1 (janela rolante). Single-click, sem date-picker.
// Controla SÓ o Bloco 1 — o Bloco 2 tem o próprio MonthSelector.
export function PeriodTabs({ value, onChange, disabled }: Props) {
  return (
    <div
      className="inline-flex rounded-xl p-1 gap-1"
      style={{ background: "var(--am-bg2)", border: "1px solid var(--am-border)" }}
      role="tablist"
    >
      {RANGES.map((r) => {
        const active = r.value === value;
        return (
          <button
            key={r.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(r.value)}
            className="text-[13px] font-medium px-3.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={{
              background: active ? "var(--am-accent)" : "transparent",
              color: active ? "var(--am-on-accent)" : "var(--am-muted)",
            }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
