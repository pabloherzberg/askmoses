import type { CallResult, IntentBreakdown, IntentSignal } from '@/lib/types'

// Calcula o Intent Index usando média ponderada dos 4 scores
// Formula: (financial*weight_f + urgency*weight_u + authority*weight_a + engagement*weight_e) / sum_weights / 2
// Resultado: 0-5 (dividido por 2 para escala de 5)
// Aceita IntentBreakdown ou um Record<string, number> cru (as 4 chaves) — os
// scores vêm do banco/IA como Record, então não exige o tipo nominal exato.
export function computeIntentIndex(scores: IntentBreakdown | Record<string, number>, weights?: { financial: number; urgency: number; authority: number; engagement: number } | Record<string, number>): number {
  const defaultWeights = { financial: 4, urgency: 3, authority: 2, engagement: 1 }
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
