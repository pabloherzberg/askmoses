"use client";

import { useEffect, useState } from "react";
import { DollarSign, Clock, Lock } from "lucide-react";
import type { BillingCycle, BillingScope } from "@/lib/types";
import { BlockHeader } from "./BlockHeader";
import { MonthSelector } from "./MonthSelector";
import { BillingCard } from "./BillingCard";
import { BillingTable } from "./BillingTable";
import { OwnerCycle } from "./OwnerCycle";
import { formatUsd, formatInt } from "./format";

// Navega "YYYY-MM" por delta de meses.
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface AdminLabels {
  title: string;
  hint: string;
  amountDue: string; // "Amount due — {month}"
  payingOrgsNote: string; // "{n} paying organizations"
  billableMinutes: string;
  closedMonth: string;
  cogs: string;
  cogsTag: string;
  footerNote: string;
  table: React.ComponentProps<typeof BillingTable>["labels"];
}

interface Props {
  scope: BillingScope;
  defaultMonth: string;
  adminLabels?: AdminLabels;
  ownerLabels?: React.ComponentProps<typeof OwnerCycle>["labels"] & { title: string; hint: string };
}

// Bloco 2 — Billing cycle (calendar month). Client: dono do mês, refetcha ao
// trocar. NÃO responde ao preset do Bloco 1 (janelas diferentes de propósito).
export function CycleBlock({ scope, defaultMonth, adminLabels, ownerLabels }: Props) {
  const [month, setMonth] = useState(defaultMonth);
  const [data, setData] = useState<BillingCycle | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumped após salvar uma nova tarifa — re-dispara o fetch pra refletir o
  // amount/rate atualizado (recalculado no backend com a nova rate).
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/billing/cycle?scope=${scope}&month=${month}`)
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (!r.ok || json?.error) {
          console.error("[billing/cycle] fetch failed", r.status, json?.error);
        }
        if (active) setData(json?.data ?? null);
      })
      .catch((err) => {
        console.error("[billing/cycle] fetch error", err);
        if (active) setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope, month, refreshKey]);

  const monthLabel = data?.monthLabel ?? month;
  const title = scope === "admin" ? adminLabels!.title : ownerLabels!.title;
  const hint = scope === "admin" ? adminLabels!.hint : ownerLabels!.hint;

  return (
    <section className="mt-8">
      <BlockHeader
        title={title}
        hint={hint}
        right={
          <MonthSelector
            monthLabel={monthLabel}
            onPrev={() => setMonth((m) => shiftMonth(m, -1))}
            onNext={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={loading}
          />
        }
      />

      <div style={{ opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}>
        {scope === "admin" && adminLabels && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <BillingCard
                label={`${adminLabels.amountDue} ${monthLabel}`}
                value={data ? formatUsd(data.amountDue) : "—"}
                note={data && data.rows ? `${data.rows.filter((r) => r.status === "PAID" || r.status === "DEMO").length} ${adminLabels.payingOrgsNote}` : undefined}
                icon={<DollarSign size={18} />}
                accent="var(--am-green)"
                bg="var(--am-green-bg)"
              />
              <BillingCard
                label={`${adminLabels.billableMinutes} ${monthLabel}`}
                value={data ? formatInt(data.billableMinutes) : "—"}
                note={adminLabels.closedMonth}
                icon={<Clock size={18} />}
                accent="var(--am-blue)"
                bg="var(--am-blue-bg)"
              />
              {/* COGS — admin only, card tracejado. */}
              <BillingCard
                label={adminLabels.cogs}
                value={data?.cogs != null ? formatUsd(data.cogs) : "—"}
                dashed
                footer={
                  <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md mt-2" style={{ background: "var(--am-bg4)", color: "var(--am-muted)" }}>
                    <Lock size={11} />
                    {adminLabels.cogsTag}
                  </span>
                }
              />
            </div>
            {data?.rows && (
              <BillingTable
                rows={data.rows}
                footerNote={adminLabels.footerNote}
                onRateUpdated={() => setRefreshKey((k) => k + 1)}
                labels={adminLabels.table}
              />
            )}
          </>
        )}

        {scope === "owner" && ownerLabels && data && (
          <OwnerCycle cycle={data} labels={ownerLabels} />
        )}
      </div>
    </section>
  );
}
