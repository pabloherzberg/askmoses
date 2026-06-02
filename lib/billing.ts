// Cobrança por minuto (US$/min). Módulo restrito às views de Admin — Owner e
// Trainer NUNCA veem custo. Mantido fora de lib/utils.ts (importado por todos
// os roles) de propósito, pra não vazar o helper de custo nos bundles client
// de rotas não-admin.

/** Tarifa de cobrança por minuto, em USD. Fonte única da verdade. */
export const COST_PER_MINUTE_USD = 2;

/**
 * Custo exato em USD para uma duração em segundos. Sem arredondar pra minuto
 * cheio — o custo acompanha a duração real (consistente com formatDuration).
 */
export function secondsToCostValue(
  totalSeconds: number | null | undefined,
): number {
  if (!totalSeconds || totalSeconds <= 0) return 0;
  return (totalSeconds / 60) * COST_PER_MINUTE_USD;
}

/** Custo formatado como moeda USD no locale ativo. Admin-only. */
export function formatCost(valueUsd: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(valueUsd);
}
