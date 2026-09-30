/**
 * Fonte única da regra "esta call entra nas análises?".
 *
 * O gate de classificação (migration 104) grava `calls.is_sales_call`:
 *
 *   true  → é call de venda. Análise completa persistida.
 *   false → NÃO é call de venda (standup interno, suporte, engano). A
 *           transcrição é salva, mas sem score, sections, outcome ou intent.
 *   NULL  → call legada, analisada ANTES do gate existir. Significa
 *           "não classificado" — explicitamente diferente de false
 *           (ver COMMENT ON COLUMN em scripts/104_calls_is_sales_call.sql).
 *
 * ─── Por que NULL conta como venda ──────────────────────────────────────────
 *
 * Toda call analisada antes da migration 104 tem is_sales_call = NULL. Um
 * filtro literal `is_sales_call = true` descartaria 100% do histórico e
 * zeraria dashboard, ranking, trends e script intelligence de todas as orgs.
 *
 * A regra correta é `IS DISTINCT FROM false`: exclui só o que a IA marcou
 * explicitamente como não-venda, preserva o histórico como "presumido venda".
 * É a mesma convenção que o código de exibição já mergeado usa
 * (`call.isSalesCall === false` em CallsTable e history).
 *
 * Se o time decidir migrar para o `= true` estrito (após um backfill que
 * classifique as calls legadas), basta trocar as duas implementações abaixo —
 * nenhum call site muda.
 */

/** Colunas mínimas exigidas para aplicar o predicado em memória. */
export interface SalesCallClassified {
  isSalesCall?: boolean | null
}

/**
 * Predicado em memória — para arrays já carregados (agregação client-side,
 * filtros pós-fetch). Espelha exatamente `applySalesCallOnly`.
 */
export function isCountableSalesCall(call: SalesCallClassified): boolean {
  return call.isSalesCall !== false
}

/** Versão para linhas cruas do Supabase (snake_case), antes do mapper. */
export function isCountableSalesCallRow(row: { is_sales_call?: boolean | null }): boolean {
  return row.is_sales_call !== false
}

/**
 * Aplica o filtro num query builder do PostgREST.
 *
 * `.not('is_sales_call', 'is', false)` gera `is_sales_call=not.is.false`, que
 * o Postgres avalia como `NOT (is_sales_call IS false)` — verdadeiro para
 * `true` E para `NULL`. É o equivalente PostgREST de `IS DISTINCT FROM false`.
 *
 * Genérico em T para preservar o tipo do builder encadeado.
 */
export function applySalesCallOnly<T extends { not(column: string, operator: string, value: unknown): T }>(
  query: T,
): T {
  return query.not('is_sales_call', 'is', false)
}

/**
 * Base do CLOSE RATE: call de venda (mesma regra de applySalesCallOnly) que
 * TEM resultado (`call_outcome IS NOT NULL`).
 *
 * Call sem resultado nunca foi avaliada — no_recording, transcription_failed,
 * presa em status intermediário ou ainda no pipeline. Ela não é "não fechou":
 * não se sabe. No denominador, derrubava o close rate por falha de pipeline
 * (em prod, 30/09/2026: 45,1% → 50,7% no agregado; numa org, 11,7% → 52,9%).
 *
 * Só para close rate. Contagem de calls, score e billing continuam em
 * applySalesCallOnly — call sem resultado é call que existiu (e pode ser
 * faturada).
 */
export function applySalesCallWithOutcome<T extends { not(column: string, operator: string, value: unknown): T }>(
  query: T,
): T {
  return applySalesCallOnly(query).not('call_outcome', 'is', null)
}

/**
 * Predicado em memória do close rate, para listas de `Call` (toCall).
 *
 * `toCall` transforma call_outcome NULL em `result: 'not_closed'` para
 * exibição e marca `hasOutcome: false`. Quem calcula close rate filtra por
 * aqui antes de contar. `hasOutcome` undefined (Call montado fora do toCall,
 * ex.: mocks) conta como com resultado.
 */
export function hasOutcome(call: { hasOutcome?: boolean }): boolean {
  return call.hasOutcome !== false
}

/** Versão para linhas cruas do Supabase (snake_case), antes do mapper. */
export function hasOutcomeRow(row: { call_outcome?: string | null }): boolean {
  return row.call_outcome != null
}

/**
 * Close rate (%) inteiro de uma lista: `closed / com resultado`. 0 quando
 * nenhuma call tem resultado. Os chamadores em memória usam esta função para
 * que a regra do denominador fique num lugar só.
 */
export function closeRateOf(calls: { result: string; hasOutcome?: boolean }[]): number {
  const decided = calls.filter(hasOutcome)
  if (decided.length === 0) return 0
  const closed = decided.filter((c) => c.result === 'closed').length
  return Math.round((closed / decided.length) * 100)
}

/**
 * Exclui calls com scoring_status = 'scoring_failed' ou 'transcript_leaked'
 * (checklist §0/§3) — zero nessas calls é falha de análise, não avaliação
 * real, e não deve entrar em médias/agregações. NULL passa (não avaliado
 * por este gate, ou call anterior à migration 109 — trata como 'ok').
 */
export function excludeFailedScoring<T extends { not(column: string, operator: string, value: unknown): T }>(
  query: T,
): T {
  return query.not('scoring_status', 'in', '(scoring_failed,transcript_leaked)')
}
