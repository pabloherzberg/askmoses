"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { BillingOrgRow, BillingStatus } from "@/lib/types";

const STATUS_OPTIONS: readonly BillingStatus[] = ["PAID", "PILOT", "DEMO", "DISABLED"];

export interface EditRateLabels {
  title: string; // "Edit billing"
  description: string; // genérico; o nome da org é anexado no componente
  rateLabel: string; // "Rate per minute (USD)"
  hint: string; // "e.g. 0.0667 ≈ $1 per 15-min call"
  statusLabel: string; // "Billing status"
  statusHint: string; // explica que PILOT/DISABLED não faturam
  status_PAID: string;
  status_PILOT: string;
  status_DEMO: string;
  status_DISABLED: string;
  cancel: string;
  save: string;
  saving: string;
  invalid: string; // erro de validação
}

interface Props {
  org: BillingOrgRow | null; // null = fechado
  onClose: () => void;
  onSaved: () => void; // dispara refetch no pai
  labels: EditRateLabels;
}

// Modal admin pra ajustar a cobrança de UMA org: tarifa + billing status.
// Tarifa é editada em USD/min (intuitivo) e convertida pra micro-USD ao salvar
// (×1e6). Os dois campos são independentes — manda só o que mudou. PATCH em
// /api/admin/organizations/[id]/billing-rate.
//
// O status é o que decide se a org entra na receita: PAID/DEMO faturam,
// PILOT/DISABLED zeram amount e saem de activePayingOrgs (lib/db/billing.ts).
export function EditRateDialog({ org, onClose, onSaved, labels }: Props) {
  const [value, setValue] = useState("");
  // O pai remonta o dialog por org (key={editing?.orgId}), então semear o
  // estado a partir da prop aqui é seguro — não fica stale entre aberturas.
  const [status, setStatus] = useState<BillingStatus>(org?.status ?? "PAID");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = org !== null;

  // Tarifa em branco = "não mexer" (caso comum: só promover PILOT → PAID).
  const rateChanged = value.trim() !== "";
  const statusChanged = org != null && status !== org.status;
  const canSave = rateChanged || statusChanged;

  function handleOpenChange(next: boolean) {
    if (!next && !saving) onClose();
  }

  async function handleSave() {
    if (!org || !canSave) return;

    const payload: { ratePerMinuteMicros?: number; billingStatus?: BillingStatus } = {};

    if (rateChanged) {
      const usd = Number(value);
      if (!isFinite(usd) || usd < 0) {
        setError(labels.invalid);
        return;
      }
      payload.ratePerMinuteMicros = Math.round(usd * 1_000_000);
    }
    if (statusChanged) payload.billingStatus = status;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/organizations/${org.orgId}/billing-rate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.error) {
        // Nunca usar json.error.message diretamente — vem em português cru
        // da API. labels.invalid já cobre o caso genérico traduzido.
        setError(labels.invalid);
        setSaving(false);
        return;
      }
      setSaving(false);
      onSaved();
      onClose();
    } catch {
      setError(labels.invalid);
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>
            {labels.description}
            {org?.name ? ` · ${org.name}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <label
            className="block text-[12px] font-medium uppercase tracking-wide mb-2"
            style={{ color: "var(--am-muted)" }}
          >
            {labels.statusLabel}
          </label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as BillingStatus);
              setError(null);
            }}
            disabled={saving}
            className="w-full rounded-lg px-3 py-2 font-mono text-[14px] outline-none cursor-pointer disabled:opacity-50"
            style={{
              background: "var(--am-bg)",
              border: "1px solid var(--am-border2)",
              color: "var(--am-text)",
            }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {labels[`status_${s}` as const]}
              </option>
            ))}
          </select>
          <p className="text-[12px] mt-2" style={{ color: "var(--am-muted)" }}>
            {labels.statusHint}
          </p>

          <label
            className="block text-[12px] font-medium uppercase tracking-wide mb-2 mt-5"
            style={{ color: "var(--am-muted)" }}
          >
            {labels.rateLabel}
          </label>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[15px]" style={{ color: "var(--am-muted)" }}>$</span>
            <input
              type="number"
              step="0.0001"
              min="0"
              autoFocus
              value={value}
              disabled={saving}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              placeholder={org?.ratePerMinute != null ? org.ratePerMinute.toString() : "0.0667"}
              className="flex-1 rounded-lg px-3 py-2 font-mono text-[15px] outline-none disabled:opacity-50"
              style={{
                background: "var(--am-bg)",
                border: "1px solid var(--am-border2)",
                color: "var(--am-text)",
              }}
            />
            <span className="font-mono text-[13px]" style={{ color: "var(--am-muted)" }}>/ min</span>
          </div>
          <p className="text-[12px] mt-2" style={{ color: "var(--am-muted)" }}>
            {labels.hint}
          </p>
          {error && (
            <p className="text-[12.5px] mt-2" style={{ color: "var(--am-red)" }}>
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-[14px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: "var(--am-bg3)", color: "var(--am-text)" }}
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !canSave}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[14px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--am-accent)", color: "var(--am-on-accent)" }}
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving ? labels.saving : labels.save}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
