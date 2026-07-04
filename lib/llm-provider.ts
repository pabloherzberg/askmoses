import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenAIProvider, resolveOpenAIModelId } from '@/lib/openai'
import { VALID_MODELS as GEMINI_VALID_MODELS } from '@/lib/gemini'

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite'

/**
 * Resolves a raw Gemini model name into a canonical id from VALID_MODELS,
 * stripping the "-001" pinned-version suffix (097/098 only seed pricing for
 * base names) and any "google/"/"models/" prefix. Falls back to
 * DEFAULT_GEMINI_MODEL when unset/unknown.
 */
export function resolveGeminiModelId(modelName?: string | null): string {
  const sanitized = (modelName ?? '')
    .replace(/^(google\/|models\/)/, '')
    .replace(/-001$/, '')
    .trim()
  if (GEMINI_VALID_MODELS.has(sanitized)) return sanitized
  // Retry with -001 suffix in case caller passed an unpinned name that only
  // exists pinned (defensive — current whitelist has both forms for 2.0).
  if (GEMINI_VALID_MODELS.has(`${sanitized}-001`)) return sanitized
  return DEFAULT_GEMINI_MODEL
}

interface ActiveProviderRow {
  provider: 'openai' | 'gemini'
  api_key: string | null
  model: string
}

interface ProviderSettingsCacheState {
  active: ActiveProviderRow | null
  expiresAt: number
}
const CACHE_TTL_MS = 5 * 60 * 1000
const cacheKey_ = Symbol.for('askmoses.llmprovider.settings')
type GlobalWithCache = typeof globalThis & { [cacheKey_]?: ProviderSettingsCacheState }
const gp = globalThis as GlobalWithCache

/**
 * Loads (with 5min cache) the currently active row from
 * llm_provider_settings. Never throws — a query failure or missing table
 * (pre-migration) resolves to `null`, which callers treat as "no override,
 * use hardcoded OpenAI/env fallback".
 */
async function getActiveProviderRow(): Promise<ActiveProviderRow | null> {
  const cached = gp[cacheKey_]
  if (cached && cached.expiresAt > Date.now()) return cached.active

  let active: ActiveProviderRow | null = null
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('llm_provider_settings')
      .select('provider, api_key, model')
      .eq('is_active', true)
      .maybeSingle()
    if (error) throw error
    active = (data as ActiveProviderRow | null) ?? null
  } catch (err) {
    console.warn('[llm-provider] failed to load active provider settings (falling back to OpenAI/env):', err)
    active = null
  }

  gp[cacheKey_] = { active, expiresAt: Date.now() + CACHE_TTL_MS }
  return active
}

export interface ResolvedLlmModel {
  model: LanguageModel
  provider: 'openai' | 'gemini'
  modelId: string
}

/**
 * Resolves which LLM provider+model+key /api/analyze should call this
 * request. `perOrgModelOverride` is the per-rubric `llm_model` string
 * (e.g. "openai/gpt-4o", "google/gemini-2.5-flash").
 *
 * Rule: the globally active provider (llm_provider_settings) always decides
 * WHICH PROVIDER is called. The per-rubric override only picks a specific
 * MODEL within that provider — and only when its prefix matches the active
 * provider; a mismatched override (e.g. rubric says google/... while OpenAI
 * is active) is ignored (logged) in favor of the active provider's default
 * model. This avoids breaking orgs when the admin flips the global switch.
 *
 * No active row (table empty / not migrated / query failure) → falls back
 * byte-identical to the pre-existing hardcoded behavior: OpenAI via
 * getOpenAIProvider() (env var) + resolveOpenAIModelId(perOrgModelOverride).
 */
export async function getActiveLlmModel(
  perOrgModelOverride?: string | null,
): Promise<ResolvedLlmModel> {
  const active = await getActiveProviderRow()

  if (!active) {
    const modelId = resolveOpenAIModelId(perOrgModelOverride)
    return { model: getOpenAIProvider()(modelId), provider: 'openai', modelId }
  }

  if (active.provider === 'openai') {
    const overrideMatches = (perOrgModelOverride ?? '').replace(/^openai\//, '') !== (perOrgModelOverride ?? '')
      || !/^google\/|^gemini\//.test(perOrgModelOverride ?? '')
    const modelId = resolveOpenAIModelId(overrideMatches ? perOrgModelOverride : active.model)
    const provider = active.api_key
      ? createOpenAI({ apiKey: active.api_key })
      : getOpenAIProvider()
    return { model: provider(modelId), provider: 'openai', modelId }
  }

  // provider === 'gemini'
  if (!active.api_key) {
    console.warn('[llm-provider] Gemini is the active provider but no api_key is configured — falling back to OpenAI/env.')
    const modelId = resolveOpenAIModelId(perOrgModelOverride)
    return { model: getOpenAIProvider()(modelId), provider: 'openai', modelId }
  }

  const overrideIsGemini = /^google\/|^gemini\//.test(perOrgModelOverride ?? '')
  const modelId = resolveGeminiModelId(overrideIsGemini ? perOrgModelOverride : active.model)
  const gemini = createGoogleGenerativeAI({ apiKey: active.api_key })
  return { model: gemini(modelId), provider: 'gemini', modelId }
}
