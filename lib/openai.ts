import { createOpenAI } from '@ai-sdk/openai'

let _provider: ReturnType<typeof createOpenAI> | null = null

export function getOpenAIProvider() {
  if (!_provider) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured in .env')
    _provider = createOpenAI({ apiKey })
  }
  return _provider
}

const VALID_MODELS = new Set([
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
])

// Demo phase default — Lucas (2026-05-04): roda em gpt-4o, sem seletor de LLM na UI.
const DEFAULT_MODEL = 'gpt-4o'

/**
 * Resolves a raw model name (which may carry an `openai/` prefix from
 * the rubrics table) into the canonical OpenAI model id we actually call.
 * Falls back to `DEFAULT_MODEL` when the input is empty/unknown.
 *
 * Exported so callers (e.g. `/api/analyze`) can persist the SAME id they
 * priced against in the cost table — otherwise `cost_usd` ends up as 0
 * because the prefixed value misses the pricing-table keys.
 */
export function resolveOpenAIModelId(modelName?: string | null): string {
  const sanitized = (modelName ?? '').replace(/^openai\//, '').trim()
  return VALID_MODELS.has(sanitized) ? sanitized : DEFAULT_MODEL
}

export function getOpenAIModel(modelName?: string | null) {
  return getOpenAIProvider()(resolveOpenAIModelId(modelName))
}
