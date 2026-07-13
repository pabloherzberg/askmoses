import type { CallResult, IntentScore } from "@/lib/types";

// Intent padrão por resultado da call — usado como fallback quando não há um
// intent (1–5) calculado pela IA (calls pré-073, análise antiga, ou valor
// inválido). Sem regra fixa por resultado — mesmo `closed` usa o breakdown
// real quando disponível.
export const INTENT_BY_RESULT: Record<CallResult, IntentScore> = {
  closed: 4,
  partial: 3,
  not_closed: 2,
  no_outcome: 1,
};

// Converte um valor cru (number/string/unknown) num IntentScore 1–5, ou null
// se não for um número finito. Faz round + clamp pra blindar contra drift da IA.
export function clampIntent(value: unknown): IntentScore | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(5, Math.round(n))) as IntentScore;
}

// Resolve o intent final de uma call (fonte única — usada pelo analyze, pelo
// mapper DbCall→Call e pelo send-coaching):
//   - usa o intent calculado pela IA quando válido (1–5);
//   - senão, cai no default por resultado (INTENT_BY_RESULT).
export function resolveIntent(
  rawIntent: unknown,
  result: CallResult,
): IntentScore {
  return clampIntent(rawIntent) ?? INTENT_BY_RESULT[result];
}
