import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOpenAIModelId } from '@/lib/openai'

// ─── Telemetria de custo de LLM ──────────────────────────────────────────────
//
// recordLlmUsage() grava UMA linha em llm_usage_events por chamada de LLM do
// backend. Essa tabela é a fonte única do COGS real da Billing (admin) —
// SUM(cost_usd) por org+janela (ver lib/db/billing.ts, migrations 088/089).
//
// Princípio: BEST-EFFORT, NUNCA LANÇA. Telemetria não pode quebrar o pipeline
// de análise/transcrição. Qualquer erro vira console.warn e a função retorna.

/** Surfaces que fazem chamada de LLM (espelha o CHECK da migration 089). */
export type LlmSurface =
  | 'analyze'
  | 'transcription'
  | 'diarization'
  | 'marketing'
  | 'insights'
  | 'coaching'
  | 'translation'
  | 'script_generation'
  | 'script_improve'
  | 'script_gap'
  | 'script_intelligence'

export interface RecordLlmUsageInput {
  /** Org dona do custo. null = não atribuível (ex.: translation i18n) → fora do COGS por-org. */
  orgId: string | null
  surface: LlmSurface
  /** Model string crua; normalizada internamente p/ casar com llm_pricing. */
  model: string
  inputTokens?: number | null
  outputTokens?: number | null
  /** Custo já computado (whisper per-minute, ou retry já somado). Tem prioridade sobre o cálculo por token. */
  costUsdOverride?: number | null
  callId?: string | null
  /** Referência livre: id de marketing_run / script / run. */
  ref?: string | null
  provider?: string
}

// ─── Cache de pricing (globalThis, sobrevive HMR — padrão de translate.ts) ────

interface PricingRow {
  provider: string
  model: string
  unit: 'per_1m_tokens' | 'per_minute'
  input_usd_per_1m: number | null
  output_usd_per_1m: number | null
  usd_per_minute: number | null
  effective_from: string
}

type PricingCacheState = {
  byKey: Map<string, PricingRow> // key = `${provider}|${model}` → linha ativa mais recente
  expiresAt: number
}
const PRICING_TTL_MS = 5 * 60 * 1000
const pricingKey_ = Symbol.for('askmoses.llmusage.pricing')
type GlobalWithPricing = typeof globalThis & { [pricingKey_]?: PricingCacheState }
const gp = globalThis as GlobalWithPricing

function pricingMapKey(provider: string, model: string): string {
  return `${provider}|${model}`
}

/** Carrega (com cache de 5min) o preço ativo mais recente por (provider, model). */
async function getPricing(): Promise<Map<string, PricingRow>> {
  const cached = gp[pricingKey_]
  if (cached && cached.expiresAt > Date.now()) return cached.byKey

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('llm_pricing')
    .select('provider, model, unit, input_usd_per_1m, output_usd_per_1m, usd_per_minute, effective_from')
    .eq('active', true)
    .order('effective_from', { ascending: false })

  if (error) throw error

  // Primeira ocorrência por (provider, model) = mais recente (já ordenado DESC).
  const byKey = new Map<string, PricingRow>()
  for (const row of (data ?? []) as PricingRow[]) {
    const k = pricingMapKey(row.provider, row.model)
    if (!byKey.has(k)) byKey.set(k, row)
  }

  gp[pricingKey_] = { byKey, expiresAt: Date.now() + PRICING_TTL_MS }
  return byKey
}

/**
 * Custo puro (USD) a partir de uma linha de pricing por tokens. Exportado p/
 * teste unitário. Whisper (per_minute) não passa por aqui — usa costUsdOverride.
 */
export function computeCostFromPricing(
  price: Pick<PricingRow, 'input_usd_per_1m' | 'output_usd_per_1m'>,
  inputTokens: number,
  outputTokens: number,
): number {
  const inUsd = (inputTokens * (price.input_usd_per_1m ?? 0)) / 1_000_000
  const outUsd = (outputTokens * (price.output_usd_per_1m ?? 0)) / 1_000_000
  return Number((inUsd + outUsd).toFixed(6))
}

/**
 * Grava 1 evento de uso de LLM. Best-effort: nunca lança — engole qualquer
 * erro com console.warn pra não derrubar o pipeline que a chamou.
 */
export async function recordLlmUsage(input: RecordLlmUsageInput): Promise<void> {
  try {
    const provider = input.provider ?? 'openai'
    // Normaliza p/ a MESMA string que está em llm_pricing (ex.: "openai/gpt-4o" → "gpt-4o").
    const model = provider === 'openai' ? resolveOpenAIModelId(input.model) : input.model
    const inputTokens = input.inputTokens ?? null
    const outputTokens = input.outputTokens ?? null

    let costUsd: number
    if (input.costUsdOverride != null) {
      costUsd = Number(input.costUsdOverride.toFixed(6))
    } else {
      const pricing = await getPricing()
      const price = pricing.get(pricingMapKey(provider, model))
      if (!price) {
        console.warn(
          `[llm-usage] no pricing for ${provider}/${model} (surface=${input.surface}) — recording cost_usd=0`,
        )
        costUsd = 0
      } else {
        costUsd = computeCostFromPricing(price, inputTokens ?? 0, outputTokens ?? 0)
      }
    }

    const supabase = createAdminClient()
    const { error } = await supabase.from('llm_usage_events').insert({
      org_id: input.orgId,
      surface: input.surface,
      provider,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      call_id: input.callId ?? null,
      ref: input.ref ?? null,
    })
    if (error) throw error
  } catch (err) {
    console.warn('[llm-usage] failed to record usage event (non-fatal):', err)
  }
}
