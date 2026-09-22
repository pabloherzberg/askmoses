/**
 * Em que estado está uma call, do ponto de vista de quem olha a tela.
 *
 * Existe porque a UI tratava quatro situações distintas como se fossem uma:
 * uma call recém-chegada, uma que não pôde ser analisada, uma que não era
 * conversa de venda e uma avaliada de verdade apareciam idênticas — com
 * rubrica 0.0, Intent fabricado e pill de desfecho. O cliente lia ausência de
 * medição como medição ruim.
 *
 * Client-safe de propósito: `lib/db/calls.ts` importa `createAdminClient` no
 * topo, então componentes 'use client' não podem ler os status de lá sem
 * arrastar o cliente Supabase admin pro bundle do browser. Mesmo motivo de
 * `lib/sales-calls.ts`.
 */

/** Status do pipeline em que a análise NÃO vai chegar. Terminal. */
export const FAILED_PROCESSING_STATUSES: ReadonlySet<string> = new Set([
  'transcription_failed',
  'no_recording',
  'auth_expired',
  'webhook_failed',
])

/**
 * Status em que a análise ainda está a caminho.
 *
 * Inclui `transcribed` de propósito: o áudio virou texto mas o scoring pode
 * não ter rodado ainda.
 *
 * ⚠️ NÃO é o mesmo conjunto que `IN_FLIGHT_STATUSES` de `lib/db/calls.ts`, e a
 * diferença é deliberada. Aquele responde "posso reatribuir esta call agora?" e
 * exclui `transcribed` — depois de transcrita, reatribuir é seguro. Este
 * responde "a análise já chegou?". Unificar os dois mudaria o comportamento de
 * reatribuição do Front Desk por causa de uma decisão de tela.
 */
export const IN_PROGRESS_PROCESSING_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'processing',
  'queued_for_chunking',
  'chunking',
  'awaiting_chunks',
  'consolidating',
  'transcribed',
])

export type CallState =
  /** Tem medição real. Mostra os números. */
  | 'analyzed'
  /** Chegou e o pipeline está rodando. A análise vem. */
  | 'analyzing'
  /** Não há medição e não vai haver — falha de pipeline. */
  | 'unavailable'
  /** O sistema decidiu corretamente não medir: não era conversa de venda. */
  | 'not_sales'

/** O mínimo que `callState` precisa ler. */
export interface CallStateInput {
  isSalesCall?: boolean | null
  processingStatus?: string | null
  sections?: unknown
  score?: number | null
}

/**
 * A call tem análise de verdade?
 *
 * `sections` preenchido é o sinal forte — é o que a IA grava ao pontuar. Score
 * sozinho cobre call legada, anterior ao formato atual. Score 0 NÃO é critério
 * de ausência: existe call genuinamente ruim com nota baixa (51 na base, em
 * 2026-09), e tratá-la como "sem análise" esconderia a pior avaliação real.
 */
export function hasAnalysis(call: CallStateInput): boolean {
  if (Array.isArray(call.sections) && call.sections.length > 0) return true
  return call.score != null
}

/**
 * Classifica a call. A ORDEM importa, e cada passo tem motivo:
 *
 * 1. Não-venda vem PRIMEIRO, antes de olhar status. O gate de classificação
 *    (migration 104) zera score/sections mas NÃO mexe em `processing_status`,
 *    que fica tipicamente em `transcribed`. Sem esta precedência, uma call de
 *    recado cairia em 'analyzing' e a tela prometeria uma análise que nunca
 *    vem — trocando uma mentira por outra.
 *
 * 2. Falha terminal antes de qualquer outra coisa: não adianta esperar.
 *
 * 3. "Tem análise" ANTES de "em progresso", porque o scoring não altera
 *    `processing_status`: uma call GHL totalmente analisada permanece em
 *    `transcribed` para sempre. Invertido, toda call pontuada viraria
 *    'analyzing'.
 *
 * 4. Sem análise e sem pipeline em voo → 'unavailable'. Não há o que esperar,
 *    e mostrar zeros seria voltar ao bug.
 */
export function callState(call: CallStateInput): CallState {
  if (call.isSalesCall === false) return 'not_sales'

  const status = call.processingStatus ?? null
  if (status && FAILED_PROCESSING_STATUSES.has(status)) return 'unavailable'

  if (hasAnalysis(call)) return 'analyzed'

  if (status && IN_PROGRESS_PROCESSING_STATUSES.has(status)) return 'analyzing'

  return 'unavailable'
}

/** Os blocos de avaliação (score, rubrica, intent, desfecho) fazem sentido? */
export function showsEvaluation(state: CallState): boolean {
  return state === 'analyzed'
}

/**
 * Reprocessar resolveria?
 *
 * Só falha de pipeline. `no_recording` não tem o que reprocessar — não houve
 * gravação. Não-venda também não: o classificador acertou, e reprocessar
 * gastaria LLM pra chegar à mesma conclusão. Hoje a CallsTable oferece o botão
 * pra não-venda justamente por não fazer esta distinção.
 */
export function canReprocess(call: CallStateInput): boolean {
  if (callState(call) !== 'unavailable') return false
  const status = call.processingStatus ?? null
  return status != null && status !== 'no_recording' && FAILED_PROCESSING_STATUSES.has(status)
}
