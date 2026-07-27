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
