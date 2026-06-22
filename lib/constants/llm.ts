// LLM-related constants for the analyze pipeline. Centralised here so that
// pricing changes don't require editing the route handler, and so that all
// magic numbers (temperatures, prompt version) live in one place.

/** USD per 1,000,000 tokens. Source: OpenAI public pricing as of 2026-01.
 *  Demo decision (Lucas, 2026-05-04): OpenAI-only — no Gemini fallback.
 *
 *  NOTA: a fonte de verdade dos preços p/ o COGS real agora é a tabela
 *  versionada `llm_pricing` (migration 084), lida por lib/services/llm-usage.ts.
 *  Este mapa permanece como (a) seed daquela tabela e (b) fallback do dual-write
 *  das colunas de custo atuais (calls.cost_usd etc.). Manter os dois em sincronia. */
export const PRICING_USD_PER_1M: Record<
  string,
  { input: number; output: number }
> = {
  'gpt-4o':        { input: 2.5,  output: 10  },
  'gpt-4o-mini':   { input: 0.15, output: 0.6 },
  'gpt-4-turbo':   { input: 10,   output: 30  },
  'gpt-4':         { input: 30,   output: 60  },
  'gpt-3.5-turbo': { input: 0.5,  output: 1.5 },
}

export function computeCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICING_USD_PER_1M[modelId]
  if (!price) return 0
  const cost = (inputTokens * price.input + outputTokens * price.output) / 1_000_000
  return Number(cost.toFixed(6))
}

/** Prompt version persisted on every analyzed call for telemetry/A-B reads. */
export const PROMPT_VERSION = 'v2'

/** Temperatures used by /api/analyze. Primary is slightly creative for
 *  natural-sounding feedback; retry is deterministic to maximise the chance
 *  of recovering valid JSON. */
export const LLM_TEMPERATURE_PRIMARY = 0.3
export const LLM_TEMPERATURE_RETRY = 0
