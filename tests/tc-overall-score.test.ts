/**
 * TC — overall_score respeita os pesos configurados (checklist §5.1)
 *
 * Antes desta correção, computeOverallScore não existia: scoring.ts e
 * analyze/route.ts faziam média simples das sections, ignorando o `weight`
 * já gravado em cada uma. Este teste trava o comportamento correto e a
 * regra de fallback (peso ausente/zerado → média simples).
 */

import { describe, it, expect } from 'vitest'
import { computeOverallScore } from '@/lib/services/overall-score'

describe('computeOverallScore', () => {
  it('pondera pelos pesos quando toda seção tem peso', () => {
    const sections = [
      { name: 'Discovery', score: 100 },
      { name: 'Close & Next Steps', score: 0 },
    ]
    const weights = new Map([
      ['discovery', 80],
      ['close & next steps', 20],
    ])
    // (100*80 + 0*20) / 100 = 80 — não os 50 de uma média simples.
    expect(computeOverallScore(sections, weights)).toBe(80)
  })

  it('cai pra média simples quando falta peso em alguma seção', () => {
    const sections = [
      { name: 'Discovery', score: 100 },
      { name: 'Close & Next Steps', score: 0 },
    ]
    const weights = new Map([['discovery', 80]]) // sem peso para a 2ª seção
    expect(computeOverallScore(sections, weights)).toBe(50)
  })

  it('cai pra média simples quando o total de pesos é 0', () => {
    const sections = [
      { name: 'Discovery', score: 40 },
      { name: 'Close & Next Steps', score: 60 },
    ]
    const weights = new Map([
      ['discovery', 0],
      ['close & next steps', 0],
    ])
    expect(computeOverallScore(sections, weights)).toBe(50)
  })

  it('retorna 0 para lista de seções vazia', () => {
    expect(computeOverallScore([], new Map())).toBe(0)
  })

  it('é case-insensitive no nome da seção', () => {
    const sections = [{ name: 'DISCOVERY', score: 70 }]
    const weights = new Map([['discovery', 100]])
    expect(computeOverallScore(sections, weights)).toBe(70)
  })
})
