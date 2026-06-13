"use client";

import { useState } from "react";
import { Info, Pencil } from "lucide-react";
import type { BillingOrgRow, BillingStatus } from "@/lib/types";
import { formatUsd, formatRate, formatInt } from "./format";
import { EditRateDialog, type EditRateLabels } from "./EditRateDialog";

const statusStyles: Record<BillingStatus, { bg: string; color: string }> = {
  PAID: { bg: "var(--am-green-bg)", color: "var(--am-green)" },
  PILOT: { bg: "var(--am-amber-bg)", color: "var(--am-amber)" },
  DEMO: { bg: "var(--am-accent2-bg, rgba(155,135,255,0.12))", color: "var(--am-accent2)" },
  DISABLED: { bg: "var(--am-red-bg)", color: "var(--am-red)" },
};

interface Props {
  rows: BillingOrgRow[];
  footerNote: string;
  // Dispara refetch do cycle no pai após salvar uma nova tarifa.
  onRateUpdated: () => void;
  labels: {
    organization: string;
    status: string;
    plan: string;
    rate: string;
    billableMin: string;
    callsBilled: string;
    amount: string;
    llmCosts: string;
    actions: string;
    totalPaid: string;
    editRate: string; // tooltip/aria do botão
    dialog: EditRateLabels;
  };
}

// Tabela de orgs (admin, Bloco 2). Coluna LLM Costs é admin-only — esta tabela
// só é renderizada na view admin. Coluna de ação abre modal pra editar a tarifa
// por org (persiste em organizations.rate_per_minute_micros).
export function BillingTable({ rows, footerNote, onRateUpdated, labels }: Props) {
  const [editing, setEditing] = useState<BillingOrgRow | null>(null);

  const totals = rows.reduce(
    (acc, r) => ({
      minutes: acc.minutes + (r.billableMinutes ?? 0),
      calls: acc.calls + r.callsBilled,
      amount: acc.amount + r.amount,
      llm: acc.llm + r.llmCost,
    }),
    { minutes: 0, calls: 0, amount: 0, llm: 0 },
  );

  const cell = "px-5 py-4 whitespace-nowrap";
  const border = { borderBottom: "1px solid var(--am-border)" };

  return (
    <div
      className="rounded-2xl border overflow-hidden mt-4"
      style={{ background: "var(--am-bg2)", borderColor: "var(--am-border)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {[
                { k: "organization", align: "left" },
                { k: "status", align: "left" },
                { k: "plan", align: "left" },
                { k: "rate", align: "right" },
                { k: "billableMin", align: "right" },
                { k: "callsBilled", align: "right" },
                { k: "amount", align: "right" },
                { k: "llmCosts", align: "right" },
                { k: "actions", align: "right" },
              ].map((c) => (
                <th
                  key={c.k}
                  className={`px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${
                    c.align === "right" ? "text-right" : "text-left"
                  }`}
                  style={{ color: "var(--am-muted)", borderBottom: "1px solid var(--am-border)" }}
                >
                  {labels[c.k as keyof typeof labels] as string}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = statusStyles[r.status];
              const zero = r.status !== "PAID" && r.status !== "DEMO";
              return (
                <tr key={r.orgId}>
                  <td className={`${cell} text-[14px] font-medium`} style={{ color: "var(--am-text)", ...border }}>
                    {r.name}
                  </td>
                  <td className={cell} style={border}>
                    <span className="inline-block text-[11px] font-medium px-2.5 py-1 rounded-md font-mono" style={{ background: s.bg, color: s.color }}>
                      {r.status}
                    </span>
                  </td>
                  <td className={`${cell} text-[13px] font-mono`} style={{ color: "var(--am-accent2)", ...border }}>
                    {r.planName}
                  </td>
                  <td className={`${cell} text-right font-mono text-[13.5px]`} style={{ color: r.ratePerMinute == null ? "var(--am-muted)" : "var(--am-text)", ...border }}>
                    {r.ratePerMinute == null ? "—" : formatRate(r.ratePerMinute)}
                  </td>
                  <td className={`${cell} text-right font-mono text-[13.5px]`} style={{ color: r.billableMinutes == null ? "var(--am-muted)" : "var(--am-text)", ...border }}>
                    {r.billableMinutes == null ? "—" : formatInt(r.billableMinutes)}
                  </td>
                  <td className={`${cell} text-right font-mono text-[13.5px]`} style={{ color: "var(--am-text)", ...border }}>
                    {formatInt(r.callsBilled)}
                  </td>
                  <td className={`${cell} text-right font-mono text-[14px]`} style={{ color: zero ? "var(--am-muted)" : "var(--am-text)", ...border }}>
                    {formatUsd(r.amount)}
                  </td>
                  <td className={`${cell} text-right font-mono text-[13.5px]`} style={{ color: "var(--am-muted)", ...border }}>
                    {formatUsd(r.llmCost)}
                  </td>
                  <td className={`${cell} text-right`} style={border}>
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      aria-label={`${labels.editRate} · ${r.name}`}
                      title={`${labels.editRate} · ${r.name}`}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-opacity hover:opacity-80"
                      style={{ color: "var(--am-muted)" }}
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {/* Linha de total — soma das pagantes. */}
            <tr style={{ background: "var(--am-bg3)" }}>
              <td className="px-5 py-4 text-[14px] font-semibold whitespace-nowrap" style={{ color: "var(--am-text)" }}>
                {labels.totalPaid}
              </td>
              <td /><td /><td />
              <td className="px-5 py-4 text-right font-mono text-[13.5px]" style={{ color: "var(--am-text)" }}>{formatInt(totals.minutes)}</td>
              <td className="px-5 py-4 text-right font-mono text-[13.5px]" style={{ color: "var(--am-text)" }}>{formatInt(totals.calls)}</td>
              <td className="px-5 py-4 text-right font-mono text-[15px] font-semibold" style={{ color: "var(--am-text)" }}>{formatUsd(totals.amount)}</td>
              <td className="px-5 py-4 text-right font-mono text-[13.5px]" style={{ color: "var(--am-muted)" }}>{formatUsd(totals.llm)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div
        className="flex items-center gap-2 px-5 py-4 text-[12.5px]"
        style={{ color: "var(--am-muted)", borderTop: "1px solid var(--am-border)" }}
      >
        <Info size={15} className="shrink-0" />
        {footerNote}
      </div>

      <EditRateDialog
        key={editing?.orgId ?? "closed"}
        org={editing}
        onClose={() => setEditing(null)}
        onSaved={onRateUpdated}
        labels={labels.dialog}
      />
    </div>
  );
}
