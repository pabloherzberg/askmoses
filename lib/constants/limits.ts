/**
 * Limits e caps centralizados — antes ficavam duplicados inline em handlers
 * diferentes (200 chars de nome, 100 orgIds por send, etc.). Manter aqui
 * evita drift entre endpoints.
 */

/** Tamanho máximo de organizations.name e ownerName em chars. */
export const MAX_ORG_NAME_LENGTH = 200

/** Cap superior de MRR (USD/mês). 10M é absurdamente alto pro mercado alvo
 *  (sales coaching); valores acima sugerem typo ou abuso. */
export const MAX_MRR_USD = 10_000_000

/** Máximo de orgIds num único POST /api/admin/scripts/send (bulk send). */
export const MAX_BULK_ORG_IDS = 100

/** Piso de duração (s) para uma call valer análise. Calls confirmadamente
 *  abaixo disso são descartadas no ingest. Mesmo valor do piso de billing, mas
 *  o tratamento de duração nula diverge — ver isConfirmedShortCall. */
export const MIN_ANALYZABLE_CALL_SECONDS = 30

/** True só com duração CONFIRMADA abaixo do piso — único caso em que o ingest
 *  pula a análise. Nula → false de propósito (perder call real > custo de LLM),
 *  divergindo do billing, que também não fatura duração nula. */
export function isConfirmedShortCall(
  durationSeconds: number | null | undefined,
): boolean {
  return durationSeconds != null && durationSeconds < MIN_ANALYZABLE_CALL_SECONDS
}

/** Rate limits — todos em (max, windowSeconds). Tweak por endpoint. */
export const RATE_LIMITS = {
  /** Sweetheart deal flow — admin override de subscription. */
  subscriptionOverride: { max: 30, windowSeconds: 60 },
  /** Bulk send durante release de versão. */
  scriptSend: { max: 30, windowSeconds: 60 },
  /** Criação de org assistida pelo admin. */
  createOrg: { max: 10, windowSeconds: 60 },
} as const
