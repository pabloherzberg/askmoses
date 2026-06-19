"use client";

import { useEffect, useState } from "react";
import { Phone, Clock, DollarSign, Building2 } from "lucide-react";
import type { BillingPeriodRange, BillingScope, BillingUsage } from "@/lib/types";
import { BlockHeader } from "./BlockHeader";
import { PeriodTabs } from "./PeriodTabs";
import { BillingCard } from "./BillingCard";
import { EstimatedValueBars } from "./EstimatedValueBars";
import { CallsPerDaySpark } from "./CallsPerDaySpark";
import { formatUsd, formatInt } from "./format";

interface Labels {
  title: string;
  hint: string;
  callsAnalyzed: string;
  billableMinutes: string;
  estimatedValue: string;
  estimatedValueNote: string;
  inSelectedPeriod: string;
  avgCallLength: string;
  activePayingOrgs: string;
  freePilotNote: string; // "{n} on free pilot"
  minSuffix: string;
  valueByOrgTitle: string;
  callsPerDayTitle: string;
  callsPerDaySubtitle: string;
}

interface Props {
  scope: BillingScope;
  labels: Labels;
}

// Bloco 1 — Usage in period (rolling). Client: dono do range, refetcha ao trocar
// preset. MSW só intercepta no browser, por isso o fetch é client-side.
export function UsageBlock({ scope, labels }: Props) {
  const [range, setRange] = useState<BillingPeriodRange>("1m");
  const [data, setData] = useState<BillingUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/billing/usage?scope=${scope}&range=${range}`)
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (!r.ok || json?.error) {
          console.error("[billing/usage] fetch failed", r.status, json?.error);
        }
        if (active) setData(json?.data ?? null);
      })
      .catch((err) => {
        console.error("[billing/usage] fetch error", err);
        if (active) setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope, range]);

  return (
    <section className="mt-6">
      <BlockHeader
        title={labels.title}
        hint={labels.hint}
        right={<PeriodTabs value={range} onChange={setRange} disabled={loading} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4" style={{ opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}>
        <BillingCard
          label={labels.callsAnalyzed}
          value={data ? formatInt(data.callsAnalyzed) : "—"}
          note={labels.inSelectedPeriod}
          icon={<Phone size={18} />}
          accent="var(--am-green)"
          bg="var(--am-green-bg)"
        />
        <BillingCard
          label={labels.billableMinutes}
          value={data ? formatInt(data.billableMinutes) : "—"}
          note={labels.inSelectedPeriod}
          icon={<Clock size={18} />}
          accent="var(--am-blue)"
          bg="var(--am-blue-bg)"
        />
        <BillingCard
          label={labels.estimatedValue}
          value={data ? formatUsd(data.estimatedValue) : "—"}
          note={labels.estimatedValueNote}
          icon={<DollarSign size={18} />}
          accent="var(--am-amber)"
          bg="var(--am-amber-bg)"
        />
        {scope === "admin" ? (
          <BillingCard
            label={labels.activePayingOrgs}
            value={data ? `${data.activePayingOrgs ?? 0} / ${data.totalOrgs ?? 0}` : "—"}
            note={
              data
                ? `${(data.totalOrgs ?? 0) - (data.activePayingOrgs ?? 0)} ${labels.freePilotNote}`
                : undefined
            }
            icon={<Building2 size={18} />}
            accent="var(--am-accent2)"
            bg="var(--am-accent2-bg, rgba(155,135,255,0.12))"
          />
        ) : (
          <BillingCard
            label={labels.avgCallLength}
            value={data?.avgCallLengthMin != null ? `${data.avgCallLengthMin.toFixed(1)} ${labels.minSuffix}` : "—"}
            note={labels.inSelectedPeriod}
            icon={<Clock size={18} />}
            accent="var(--am-accent2)"
            bg="var(--am-accent2-bg, rgba(155,135,255,0.12))"
          />
        )}
      </div>

      {scope === "admin" && data?.valueByOrg && data.valueByOrg.length > 0 && (
        <EstimatedValueBars title={labels.valueByOrgTitle} rows={data.valueByOrg} />
      )}
      {scope === "owner" && data?.callsPerDay && (
        <CallsPerDaySpark
          title={labels.callsPerDayTitle}
          subtitle={labels.callsPerDaySubtitle}
          data={data.callsPerDay}
        />
      )}
    </section>
  );
}
