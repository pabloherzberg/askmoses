"use client";

import type { IntentDateRange } from "@/lib/types";

const RANGES: { value: IntentDateRange; label: string }[] = [
  { value: "1w", label: "1 week" },
  { value: "2w", label: "2 weeks" },
  { value: "15d", label: "15 days" },
  { value: "1m", label: "1 month" },
];

interface Props {
  value: IntentDateRange;
  onChange: (range: IntentDateRange) => void;
  disabled?: boolean;
}

// Seletor de range temporal da lista "Highest Priority Leads" do Intent
// dashboard. Independente do PeriodTabs de billing (ranges diferentes).
export function IntentPeriodTabs({ value, onChange, disabled }: Props) {
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
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
