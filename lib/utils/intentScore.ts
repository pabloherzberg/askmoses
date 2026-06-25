import type { CallResult, IntentBreakdown, IntentSignal } from '@/lib/types'
import { DEFAULT_INTENT_WEIGHTS } from '@/lib/constants/intent'

// Calcula o Intent Index usando média ponderada dos 4 scores
// Formula: (financial*weight_f + urgency*weight_u + authority*weight_a + engagement*weight_e) / sum_weights / 2
// Resultado: 0-5 (dividido por 2 para escala de 5)
// O índice é invariante à base dos pesos (normaliza por totalWeight), então
// pesos base 10 (legado) e base 100 (atual) produzem o mesmo resultado.
// Aceita IntentBreakdown ou um Record<string, number> cru (as 4 chaves) — os
// scores vêm do banco/IA como Record, então não exige o tipo nominal exato.
export function computeIntentIndex(scores: IntentBreakdown | Record<string, number>, weights?: { financial: number; urgency: number; authority: number; engagement: number } | Record<string, number>): number {
  const defaultWeights = DEFAULT_INTENT_WEIGHTS
  const w = weights || defaultWeights
  const totalWeight =
    (w.financial ?? defaultWeights.financial) +
    (w.urgency ?? defaultWeights.urgency) +
    (w.authority ?? defaultWeights.authority) +
    (w.engagement ?? defaultWeights.engagement)

  const weightedSum =
    (scores.financial ?? 0) * w.financial +
    (scores.urgency ?? 0) * w.urgency +
    (scores.authority ?? 0) * w.authority +
    (scores.engagement ?? 0) * w.engagement

  const weightedMean = weightedSum / totalWeight
  return Math.round((weightedMean / 2) * 10) / 10
}

// Extrai os 4 pesos a partir da lista de signals, com fallback no default
// (base 100 — 25/25/25/25). Centraliza o padrão antes espalhado como
// `signals.find(s => s.id === 'financial')?.weight || 4` em vários componentes.
export function resolveIntentWeights(
  signals: Pick<IntentSignal, 'id' | 'weight'>[],
): { financial: number; urgency: number; authority: number; engagement: number } {
  const byId = (id: string) => signals.find((s) => s.id === id)?.weight
  return {
    financial: byId('financial') ?? DEFAULT_INTENT_WEIGHTS.financial,
    urgency: byId('urgency') ?? DEFAULT_INTENT_WEIGHTS.urgency,
    authority: byId('authority') ?? DEFAULT_INTENT_WEIGHTS.authority,
    engagement: byId('engagement') ?? DEFAULT_INTENT_WEIGHTS.engagement,
  }
}

export function isCallClosed(result: CallResult): boolean {
  return result === 'closed'
}

export function deriveCallIntentBreakdown(intent: number, isClosed: boolean): IntentBreakdown {
  if (isClosed) {
    return { financial: 10, urgency: 10, authority: 10, engagement: 10 }
  }
  const base = intent * 2
  return {
    financial: base + (Math.sin(1) * 2),
    urgency: base + (Math.sin(2) * 2),
    authority: base + (Math.sin(3) * 2),
    engagement: base + (Math.sin(4) * 2),
  }
}

export function intentIndexToDisplay(index: number): string {
  return index.toFixed(1)
}
