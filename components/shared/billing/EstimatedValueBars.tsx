import type { BillingValueByOrg } from "@/lib/types";
import { formatUsd } from "./format";

interface Props {
  title: string;
  rows: BillingValueByOrg[];
}

// Bar list "Estimated value by organization" (admin, Bloco 1). Ordenado desc;
// a barra de maior valor preenche 100%, demais proporcionais.
export function EstimatedValueBars({ title, rows }: Props) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((r) => r.value), 1);
  return (
    <div
      className="rounded-2xl border p-5 mt-4"
      style={{ background: "var(--am-bg2)", borderColor: "var(--am-border)" }}
    >
      <p className="text-[15px] font-semibold mb-4" style={{ color: "var(--am-text)" }}>
        {title}
      </p>
      <div className="flex flex-col gap-3.5">
        {sorted.map((r) => (
          <div key={r.orgId} className="flex items-center gap-3.5">
            <span
              className="w-44 shrink-0 text-[14px] font-medium truncate"
              style={{ color: "var(--am-text)" }}
            >
              {r.name}
            </span>
            <div
              className="flex-1 h-3 rounded-full overflow-hidden"
              style={{ background: "var(--am-bg4)" }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${(r.value / max) * 100}%`, background: "var(--am-accent)" }}
              />
            </div>
            <span
              className="w-24 shrink-0 text-right font-mono text-[13.5px]"
              style={{ color: "var(--am-text)" }}
            >
              {formatUsd(r.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
