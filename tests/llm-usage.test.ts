/**
 * Cobertura de computeCostFromPricing — função pura que converte tokens +
 * preço (de llm_pricing) em cost_usd, base do COGS real da Billing.
 *
 *   - lib/services/llm-usage.ts · computeCostFromPricing
 *
 * Os preços de referência espelham PRICING_USD_PER_1M (lib/constants/llm.ts),
 * que é o seed da migration 084.
 */
import { describe, it, expect } from 'vitest'
import { computeCostFromPricing } from '@/lib/services/llm-usage'

describe('computeCostFromPricing', () => {
  it('soma input + output proporcionalmente a 1M tokens (gpt-4o)', () => {
    // gpt-4o: input 2.5, output 10 USD/1M
    // 1M input → 2.5; 1M output → 10; total 12.5
    expect(
      computeCostFromPricing(
        { input_usd_per_1m: 2.5, output_usd_per_1m: 10 },
        1_000_000,
        1_000_000,
      ),
    ).toBe(12.5)
  })

  it('escala linearmente para frações de 1M (gpt-4o-mini)', () => {
    // gpt-4o-mini: input 0.15, output 0.6 USD/1M
    // 100k input → 0.015; 50k output → 0.03; total 0.045
    expect(
      computeCostFromPricing(
        { input_usd_per_1m: 0.15, output_usd_per_1m: 0.6 },
        100_000,
        50_000,
      ),
    ).toBe(0.045)
  })

  it('zero tokens → custo zero', () => {
    expect(
      computeCostFromPricing({ input_usd_per_1m: 2.5, output_usd_per_1m: 10 }, 0, 0),
    ).toBe(0)
  })

  it('trata preço null como 0 (ex.: linha per_minute sem token price)', () => {
    expect(
      computeCostFromPricing(
        { input_usd_per_1m: null, output_usd_per_1m: null },
        1_000_000,
        1_000_000,
      ),
    ).toBe(0)
  })

  it('arredonda para 6 casas decimais', () => {
    // 1 token de input a 0.15/1M = 0.00000015 → arredonda p/ 6 casas = 0.0000002 (0.00000015 → 0)
    const v = computeCostFromPricing(
      { input_usd_per_1m: 0.15, output_usd_per_1m: 0.6 },
      1,
      1,
    )
    // (0.15 + 0.6)/1e6 = 0.00000075 → toFixed(6) = 0.000001
    expect(v).toBe(0.000001)
  })
})
