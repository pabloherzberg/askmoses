/**
 * Cobertura dos helpers de duração/billing do modelo de cobrança por minuto.
 *
 *   - lib/format.ts   · formatDuration
 *   - lib/billing.ts  · billableMinutes, MIN_BILLABLE_SECONDS
 *
 * São funções puras que decidem o que o Owner vê (duração) e quantos minutos o
 * SaaS Panel conta — pequenas, mas com edge cases (null/0, padding, o piso de
 * 30s e o arredondamento por call).
 */
import { describe, it, expect } from 'vitest'
import { formatDuration } from '@/lib/format'
import { billableMinutes, MIN_BILLABLE_SECONDS } from '@/lib/billing'

describe('formatDuration', () => {
  it('retorna "—" para duração desconhecida (null/undefined/0/negativo)', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(undefined)).toBe('—')
    expect(formatDuration(0)).toBe('—')
    expect(formatDuration(-30)).toBe('—')
    expect(formatDuration(NaN)).toBe('—')
    expect(formatDuration(Infinity)).toBe('—')
  })

  it('abaixo de 1 minuto mostra só segundos', () => {
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(1)).toBe('1s')
    expect(formatDuration(59)).toBe('59s')
  })

  it('minutos + segundos com padding de 2 dígitos', () => {
    expect(formatDuration(90)).toBe('1m30s')
    expect(formatDuration(65)).toBe('1m05s')
    expect(formatDuration(60)).toBe('1m00s')
  })

  it('agregados grandes (consumo mensal da org)', () => {
    expect(formatDuration(620 * 60)).toBe('620m00s')
    expect(formatDuration(2280)).toBe('38m00s')
  })

  it('arredonda segundos fracionados antes de formatar', () => {
    expect(formatDuration(89.9)).toBe('1m30s') // round(89.9)=90
    expect(formatDuration(59.6)).toBe('1m00s') // round→60 → vira 1m00s
    expect(formatDuration(59.4)).toBe('59s') // round→59
  })
})

/**
 * billableMinutes espelha a regra de lib/db/billing.ts (ceil por call, calls
 * < 30s não faturam). Estes testes travam essa paridade: se alguém mudar a
 * conta do painel sem mudar a do Billing, quebram aqui.
 */
describe('billableMinutes', () => {
  it('piso de faturamento é 30s', () => {
    expect(MIN_BILLABLE_SECONDS).toBe(30)
  })

  it('retorna 0 para entrada vazia/inválida', () => {
    expect(billableMinutes(null)).toBe(0)
    expect(billableMinutes(undefined)).toBe(0)
    expect(billableMinutes(0)).toBe(0)
    expect(billableMinutes(-60)).toBe(0)
    expect(billableMinutes(NaN)).toBe(0)
    expect(billableMinutes(Infinity)).toBe(0)
  })

  it('call abaixo de 30s não fatura', () => {
    expect(billableMinutes(29)).toBe(0)
    expect(billableMinutes(29.9)).toBe(0)
  })

  it('arredonda pra minuto cheio a partir de 30s', () => {
    expect(billableMinutes(30)).toBe(1)
    expect(billableMinutes(60)).toBe(1)
    expect(billableMinutes(61)).toBe(2) // 1m01s → 2 min faturados
    expect(billableMinutes(90)).toBe(2)
    expect(billableMinutes(120)).toBe(2)
    expect(billableMinutes(15 * 60)).toBe(15)
  })

  it('soma por call, não sobre o total (é o que difere do modelo antigo)', () => {
    // 3 calls de 1m30s: 3 × ceil(90/60) = 6 min faturados — não ceil(270/60)=5.
    const calls = [90, 90, 90]
    expect(calls.reduce((s, d) => s + billableMinutes(d), 0)).toBe(6)
  })
})
