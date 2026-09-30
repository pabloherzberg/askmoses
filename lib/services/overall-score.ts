/**
 * Calcula o overall score (0–100) a partir das seções pontuadas pela IA.
 *
 * Média ponderada pelos pesos configurados (rubric_criteria.weight /
 * script sections, 0–100, soma esperada = 100 por script). Pesos são
 * OPCIONAIS — rubrics/scripts legados podem não ter nenhum configurado, e um
 * script pode ter peso só em algumas seções. Nesses casos cai pra média
 * simples, que era o único comportamento antes desta função existir (ver
 * checklist §5.1 — os pesos eram gravados no JSONB de cada seção mas nunca
 * usados no cálculo).
 *
 * Usado por lib/services/scoring.ts e app/api/analyze/route.ts — os dois
 * forks do pipeline de scoring (upload manual vs. GHL). Extraído pra
 * função única pra não deixar os dois cálculos divergirem de novo.
 */
export function computeOverallScore(
  sections: Array<{ score: number; name: string }>,
  weightByName: Map<string, number>,
): number {
  if (sections.length === 0) return 0

  const allWeighted = sections.every((s) => weightByName.has(s.name.toLowerCase()))
  if (!allWeighted) {
    const avg = sections.reduce((sum, s) => sum + s.score, 0) / sections.length
    return Math.round(avg)
  }

  const totalWeight = sections.reduce(
    (sum, s) => sum + (weightByName.get(s.name.toLowerCase()) ?? 0),
    0,
  )
  if (totalWeight <= 0) {
    const avg = sections.reduce((sum, s) => sum + s.score, 0) / sections.length
    return Math.round(avg)
  }

  const weightedSum = sections.reduce(
    (sum, s) => sum + s.score * (weightByName.get(s.name.toLowerCase()) ?? 0),
    0,
  )
  return Math.round(weightedSum / totalWeight)
}
