// Helper neutro (sem deps de server) — mês corrente "YYYY-MM" em UTC, usado
// como default do seletor de mês da feature de Billing. Mantido fora de
// lib/billing.ts (admin-only) e de lib/db/billing.ts pra poder ser importado
// por páginas/componentes sem puxar o admin client.
export function currentMonthUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
