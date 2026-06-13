import { Check, Info, Star, Clock } from "lucide-react";
import type { BillingCycle } from "@/lib/types";
import { formatUsd, formatRate, formatInt } from "./format";

interface Labels {
  amountDueTitle: string;
  amountDueFor: string; // ex.: "{month} · so far this month"
  updatesTag: string;
  howTitle: string;
  callsBilled: string;
  billableMin: string;
  avgCallLength: string;
  yourRate: string;
  minSuffix: string;
  perMinSuffix: string;
  usageHistory: string;
  inProgress: string;
  colPeriod: string;
  colCalls: string;
  colMinutes: string;
  colAmount: string;
  payTitle: string;
  payBody: string;
}

// Bloco 2 do owner: hero "Amount due" + "How you're billed" + stats + usage
// history (read-only) + payment note. Copy de "How you're billed" vem do payload
// (cycle.howYouAreBilled — config, regras pendentes §7), não hardcodada.
export function OwnerCycle({ cycle, labels }: { cycle: BillingCycle; labels: Labels }) {
  const how = cycle.howYouAreBilled ?? [];
  const history = cycle.history ?? [];

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4 mt-4">
        {/* Hero */}
        <div
          className="rounded-2xl border px-7 py-7 relative overflow-hidden"
          style={{ background: "var(--am-bg2)", borderColor: "var(--am-border)" }}
        >
          <p className="text-[12.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--am-muted)" }}>
            {labels.amountDueTitle}
          </p>
          <p className="text-[52px] leading-none font-mono font-bold mt-2.5 mb-1" style={{ color: "var(--am-text)" }}>
            {formatUsd(cycle.amountDue)}
          </p>
          <p className="text-[14px]" style={{ color: "var(--am-muted)" }}>
            {cycle.monthLabel} {labels.amountDueFor}
          </p>
          <div className="flex flex-wrap gap-2.5 mt-5">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-mono font-medium px-3 py-1.5 rounded-lg" style={{ background: "var(--am-accent2-bg, rgba(155,135,255,0.12))", color: "var(--am-accent2)" }}>
              <Star size={13} />
              {cycle.planName}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-mono font-medium px-3 py-1.5 rounded-lg" style={{ background: "var(--am-amber-bg)", color: "var(--am-amber)" }}>
              <Clock size={13} />
              {labels.updatesTag}
            </span>
          </div>
        </div>

        {/* How you're billed */}
        <div
          className="rounded-2xl border px-6 py-6"
          style={{ background: "var(--am-bg2)", borderColor: "var(--am-border)" }}
        >
          <p className="text-[15px] font-semibold flex items-center gap-2 mb-3.5" style={{ color: "var(--am-text)" }}>
            <Info size={18} style={{ color: "var(--am-accent)" }} />
            {labels.howTitle}
          </p>
          <ul className="flex flex-col">
            {how.map((line, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 py-2.5 text-[14px]"
                style={{
                  color: "var(--am-text)",
                  borderBottom: i < how.length - 1 ? "1px solid var(--am-border)" : "none",
                }}
              >
                <Check size={18} className="shrink-0 mt-0.5" style={{ color: "var(--am-green)" }} />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <Stat label={labels.callsBilled} value={formatInt(cycle.callsBilled)} />
        <Stat label={labels.billableMin} value={formatInt(cycle.billableMinutes)} />
        <Stat label={labels.avgCallLength} value={cycle.avgCallLengthMin.toFixed(1)} suffix={labels.minSuffix} />
        <Stat label={labels.yourRate} value={formatRate(cycle.ratePerMinute)} suffix={labels.perMinSuffix} />
      </div>

      {/* Usage history (read-only) */}
      <p className="text-[15px] font-semibold mt-6 mb-3" style={{ color: "var(--am-text)" }}>
        {labels.usageHistory}
      </p>
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--am-bg2)", borderColor: "var(--am-border)" }}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {[labels.colPeriod, labels.colCalls, labels.colMinutes, labels.colAmount].map((h, i) => (
                <th
                  key={h}
                  className={`px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}
                  style={{ color: "var(--am-muted)", borderBottom: "1px solid var(--am-border)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((row, i) => (
              <tr key={row.period}>
                <td className="px-5 py-4 text-[14px]" style={{ color: "var(--am-text)", borderBottom: i < history.length - 1 ? "1px solid var(--am-border)" : "none" }}>
                  <span className="font-medium">{row.period}</span>
                  {row.inProgress && (
                    <span className="ml-2 text-[12px]" style={{ color: "var(--am-muted)" }}>· {labels.inProgress}</span>
                  )}
                </td>
                <td className="px-5 py-4 text-right font-mono text-[13.5px]" style={{ color: "var(--am-muted)", borderBottom: i < history.length - 1 ? "1px solid var(--am-border)" : "none" }}>{formatInt(row.calls)}</td>
                <td className="px-5 py-4 text-right font-mono text-[13.5px]" style={{ color: "var(--am-muted)", borderBottom: i < history.length - 1 ? "1px solid var(--am-border)" : "none" }}>{formatInt(row.minutes)}</td>
                <td className="px-5 py-4 text-right font-mono text-[14px] font-medium" style={{ color: "var(--am-text)", borderBottom: i < history.length - 1 ? "1px solid var(--am-border)" : "none" }}>{formatUsd(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment note */}
      <div
        className="flex items-center gap-4 rounded-2xl border px-5 py-4 mt-4"
        style={{ background: "var(--am-blue-bg)", borderColor: "var(--am-border)" }}
      >
        <div className="w-10 h-10 rounded-lg inline-flex items-center justify-center shrink-0" style={{ background: "var(--am-bg2)", color: "var(--am-blue)" }}>
          <Info size={20} />
        </div>
        <div>
          <p className="text-[14.5px] font-semibold" style={{ color: "var(--am-text)" }}>{labels.payTitle}</p>
          <p className="text-[13.5px] mt-0.5" style={{ color: "var(--am-muted)" }}>{labels.payBody}</p>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-2xl border px-5 py-4" style={{ background: "var(--am-bg2)", borderColor: "var(--am-border)" }}>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--am-muted)" }}>{label}</p>
      <p className="text-2xl font-mono font-semibold mt-2" style={{ color: "var(--am-text)" }}>
        {value}
        {suffix && <span className="text-[14px] font-normal ml-1" style={{ color: "var(--am-muted)" }}>{suffix}</span>}
      </p>
    </div>
  );
}
