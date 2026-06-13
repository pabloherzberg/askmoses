import type React from "react";

interface Props {
  title: string;
  hint?: string;
  right?: React.ReactNode;
}

// Cabeçalho de bloco: título + hint (rótulo da janela) à esquerda, seletor à
// direita, separado por linha. Usado por ambos os blocos (Usage / Billing cycle).
export function BlockHeader({ title, hint, right }: Props) {
  return (
    <div
      className="flex items-center justify-between flex-wrap gap-3 pb-3.5 mb-4"
      style={{ borderBottom: "1px solid var(--am-border)" }}
    >
      <h2
        className="text-[18px] font-semibold flex items-baseline gap-2.5"
        style={{ color: "var(--am-text)" }}
      >
        {title}
        {hint && (
          <span
            className="text-[12.5px] font-medium"
            style={{ color: "var(--am-muted)" }}
          >
            {hint}
          </span>
        )}
      </h2>
      {right}
    </div>
  );
}
