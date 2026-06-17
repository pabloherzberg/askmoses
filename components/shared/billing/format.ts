// Formatação USD para a feature de Billing. Local (não importa lib/billing.ts,
// que é admin-only por design) pra owner e admin compartilharem sem vazar o
// módulo de custo interno em bundles não-admin. USD é a moeda base de cobrança —
// sempre "en-US", independente do locale da UI.
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUsd(value: number): string {
  return usd.format(value);
}

/** Rate por minuto — 4 casas (ex.: "$0.0667"). */
const usdRate = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

export function formatRate(value: number): string {
  return usdRate.format(value);
}

/** Inteiro com separador de milhar (ex.: "12,450"). */
export function formatInt(value: number): string {
  return value.toLocaleString("en-US");
}
