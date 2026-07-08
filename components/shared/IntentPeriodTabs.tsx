"use client";

import { useTranslations } from "next-intl";
import type { IntentDateRange } from "@/lib/types";

const RANGES: { value: IntentDateRange; labelKey: string }[] = [
  { value: "1w", labelKey: "period1w" },
  { value: "2w", labelKey: "period2w" },
  { value: "15d", labelKey: "period15d" },
  { value: "1m", labelKey: "period1m" },
];

interface Props {
  value: IntentDateRange;
  onChange: (range: IntentDateRange) => void;
  disabled?: boolean;
}

// Seletor de range temporal da lista "Highest Priority Leads" do Intent
// dashboard. Independente do PeriodTabs de billing (ranges diferentes).
export function IntentPeriodTabs({ value, onChange, disabled }: Props) {
  const t = useTranslations("Intent");
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
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={{
              background: active ? "var(--am-accent)" : "transparent",
              color: active ? "var(--am-on-accent)" : "var(--am-muted)",
            }}
          >
            {t(r.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
