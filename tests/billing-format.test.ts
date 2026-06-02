/**
 * Cobertura dos helpers de duração/billing introduzidos no modelo de cobrança
 * por minuto — formatação (UI) e conversão segundos→USD (Admin).
 *
 *   - lib/format.ts   · formatDuration
 *   - lib/billing.ts  · secondsToCostValue, formatCost, COST_PER_MINUTE_USD
 *
 * São funções puras que decidem o que o Owner vê (duração) e o que o Admin
 * cobra (custo) — pequenas, mas com edge cases (null/0, padding, precisão).
 */
import { describe, it, expect } from 'vitest'
import { formatDuration } from '@/lib/format'
import { secondsToCostValue, formatCost, COST_PER_MINUTE_USD } from '@/lib/billing'

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

describe('secondsToCostValue', () => {
  it('tarifa única = US$2/min', () => {
    expect(COST_PER_MINUTE_USD).toBe(2)
  })

  it('retorna 0 para entrada vazia/inválida', () => {
    expect(secondsToCostValue(null)).toBe(0)
    expect(secondsToCostValue(undefined)).toBe(0)
    expect(secondsToCostValue(0)).toBe(0)
    expect(secondsToCostValue(-60)).toBe(0)
  })

  it('custo exato proporcional aos segundos (sem arredondar minuto)', () => {
    expect(secondsToCostValue(60)).toBe(2)
    expect(secondsToCostValue(90)).toBe(3) // 1m30s → US$3
    expect(secondsToCostValue(30)).toBe(1) // meio minuto → US$1
    expect(secondsToCostValue(620 * 60)).toBe(1240)
  })
})

describe('formatCost', () => {
  it('formata como moeda USD (default en-US)', () => {
    expect(formatCost(1240)).toBe('$1,240.00')
    expect(formatCost(2)).toBe('$2.00')
    expect(formatCost(0)).toBe('$0.00')
    expect(formatCost(1.5)).toBe('$1.50')
  })
})
