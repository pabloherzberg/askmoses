import type React from "react";

interface BillingCardProps {
  label: string;
  value: string;
  note?: string;
  icon?: React.ReactNode;
  accent?: string;
  bg?: string;
  // Estilo "admin only" — borda tracejada/cinza (ex.: card de COGS).
  dashed?: boolean;
  // Conteúdo extra abaixo do valor (ex.: tag "Admin only · ~70% margin").
  footer?: React.ReactNode;
}

// Card de métrica de billing. Espelha o MetricCard do painel /admin
// (app/[locale]/(admin)/admin/page.tsx) usando tokens --am-*.
export function BillingCard({
  label,
  value,
  note,
  icon,
  accent = "var(--am-accent2)",
  bg = "var(--am-accent2-bg, rgba(155,135,255,0.12))",
  dashed = false,
  footer,
}: BillingCardProps) {
  return (
    <div
      className="rounded-2xl border px-5 py-4 flex items-start justify-between gap-3"
      style={{
        background: "var(--am-bg2)",
        borderColor: "var(--am-border)",
        borderStyle: dashed ? "dashed" : "solid",
      }}
    >
      <div className="min-w-0">
        <p
          className="text-[11px] font-medium uppercase tracking-wide"
          style={{ color: "var(--am-muted)" }}
        >
          {label}
        </p>
        <p
          className="text-2xl font-mono font-semibold mt-1"
          style={{ color: "var(--am-text)" }}
        >
          {value}
        </p>
        {note && (
          <p className="text-[12px] mt-1.5" style={{ color: "var(--am-muted)" }}>
            {note}
          </p>
        )}
        {footer}
      </div>
      {icon && (
        <div
          className="w-9 h-9 rounded-md inline-flex items-center justify-center shrink-0"
          style={{ background: bg, color: accent }}
        >
          {icon}
        </div>
      )}
    </div>
  );
}
