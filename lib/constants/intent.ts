/**
 * Intent Index Constants
 *
 * Configurações para o sistema de cálculo de Intent.
 * Intent é uma escala 0-5 que representa a probabilidade de conversão
 * baseada em 4 sinais ponderados: Financial, Urgency, Authority, Engagement.
 *
 * Metodologia igual ao Rubric: seções com pesos configuráveis que somam 100%.
 * O índice é invariante à base dos pesos (computeIntentIndex normaliza por
 * weightedSum / totalWeight), então snapshots antigos em base 10 seguem
 * calculando o mesmo valor.
 */

// Pesos padrão para cada sinal (somam 100 — igual rubric)
export const DEFAULT_INTENT_WEIGHTS = {
  financial: 25,
  urgency: 25,
  authority: 25,
  engagement: 25,
} as const;

// IDs dos sinais de intent
export const INTENT_SIGNAL_IDS = [
  'financial',
  'urgency',
  'authority',
  'engagement',
] as const;

// Validação de peso individual (base 100, mesma mecânica do rubric)
export const INTENT_WEIGHT_CONSTRAINTS = {
  MIN: 0, // Peso mínimo
  MAX: 100, // Peso máximo por sinal
  TOTAL: 100, // Total de pesos deve ser exatamente este valor
} as const;

// Validação de scores
export const INTENT_SCORE_CONSTRAINTS = {
  MIN: 0, // Score mínimo (0-10)
  MAX: 10, // Score máximo
} as const;

// Escalas de exibição
export const INTENT_DISPLAY = {
  SCALE_DIVISOR: 2, // Divide por 2 para converter 0-10 em 0-5
  DECIMALS: 1, // Casas decimais na exibição
  MIN_DISPLAY: 0.0, // Mínimo na escala 0-5
  MAX_DISPLAY: 5.0, // Máximo na escala 0-5
} as const;

// Regras de negócio
export const INTENT_RULES = {
  /**
   * Se uma call está fechada, o Intent é sempre 5.0 (máximo).
   * Isso independe dos scores dos sinais.
   */
  CLOSED_CALL_INTENT: 5.0,
} as const;

/**
 * Validar se weights são válidos
 */
export function validateIntentWeights(weights: Record<string, number>): {
  valid: boolean
  error?: string
} {
  const keys = Object.keys(weights)
  const total = Object.values(weights).reduce((a, b) => a + b, 0)

  // Verificar se tem todos os sinais
  if (!INTENT_SIGNAL_IDS.every((id) => keys.includes(id))) {
    return {
      valid: false,
      error: `Missing signals. Required: ${INTENT_SIGNAL_IDS.join(', ')}`,
    }
  }

  // Verificar min/max
  for (const [signal, weight] of Object.entries(weights)) {
    if (weight < INTENT_WEIGHT_CONSTRAINTS.MIN || weight > INTENT_WEIGHT_CONSTRAINTS.MAX) {
      return {
        valid: false,
        error: `${signal} weight must be between ${INTENT_WEIGHT_CONSTRAINTS.MIN} and ${INTENT_WEIGHT_CONSTRAINTS.MAX}`,
      }
    }
  }

  // Verificar total
  if (total !== INTENT_WEIGHT_CONSTRAINTS.TOTAL) {
    return {
      valid: false,
      error: `Total weight must be exactly ${INTENT_WEIGHT_CONSTRAINTS.TOTAL}, got ${total}`,
    }
  }

  return { valid: true }
}
