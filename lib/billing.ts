// Regra de minutos faturáveis usada pelo SaaS Panel (/admin) — espelha o que a
// feature de Billing já cobra. Único consumidor: lib/db/clients.ts.
//
// A AUTORIDADE é lib/db/billing.ts (handoff §6/§7). Ele define a regra e NÃO
// importa deste módulo — billing não muda por causa desta tela. Aqui só
// reproduzimos a mesma conta pro painel, que antes somava duration_seconds cru
// (sem piso, sem arredondar) e por isso mostrava um número diferente do Billing
// pro mesmo mês da mesma org.
//
// ⚠️ Duplicação consciente: se accumulate()/MIN_BILLABLE_SECONDS mudarem em
// lib/db/billing.ts, atualizar aqui também. tests/billing-format.test.ts trava
// os casos-chave (piso de 30s, ceil por call) pra o drift aparecer em teste.
//
// Só regra de MINUTOS: nem tarifa nem custo vivem aqui — dinheiro é assunto de
// /admin/billing, que deriva o valor da tarifa por org.

/** Duração mínima pra uma call ser faturada (segundos). Piso de COBRANÇA —
 *  independente de MIN_ANALYZABLE_CALL_SECONDS (lib/constants/limits.ts), que
 *  é o piso de INGEST. Valem 30 os dois hoje, por coincidência, não por
 *  acoplamento: mexer num não deve mexer no outro. */
export const MIN_BILLABLE_SECONDS = 30;

/**
 * Minutos faturáveis de UMA call: minuto cheio arredondado pra cima. Duração
 * desconhecida (null) ou abaixo de MIN_BILLABLE_SECONDS não fatura → 0.
 */
export function billableMinutes(
  durationSeconds: number | null | undefined,
): number {
  if (durationSeconds == null || !Number.isFinite(durationSeconds)) return 0;
  if (durationSeconds < MIN_BILLABLE_SECONDS) return 0;
  return Math.ceil(durationSeconds / 60);
}
