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
import type { BillingOrgRow } from "@/lib/types";

export interface EditRateLabels {
  title: string; // "Edit billing rate"
  description: string; // genérico; o nome da org é anexado no componente
  rateLabel: string; // "Rate per minute (USD)"
  hint: string; // "e.g. 0.0667 ≈ $1 per 15-min call"
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

// Modal admin pra ajustar a tarifa por org. Edita em USD/min (intuitivo) e
// converte pra micro-USD ao salvar (×1e6). PATCH em
// /api/admin/organizations/[id]/billing-rate.
export function EditRateDialog({ org, onClose, onSaved, labels }: Props) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reinicializa o input quando abre pra outra org. key no pai garante remount,
  // mas mantemos o seed defensivo aqui também.
  const open = org !== null;

  function handleOpenChange(next: boolean) {
    if (!next && !saving) onClose();
  }

  async function handleSave() {
    if (!org) return;
    const usd = Number(value);
    if (!isFinite(usd) || usd < 0) {
      setError(labels.invalid);
      return;
    }
    const micros = Math.round(usd * 1_000_000);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/organizations/${org.orgId}/billing-rate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratePerMinuteMicros: micros }),
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
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              placeholder={org?.ratePerMinute != null ? org.ratePerMinute.toString() : "0.0667"}
              className="flex-1 rounded-lg px-3 py-2 font-mono text-[15px] outline-none"
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
            disabled={saving || value.trim() === ""}
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
