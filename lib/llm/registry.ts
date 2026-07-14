import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'
import type { LlmProvider } from '@/lib/types'
import { PROVIDER_CATALOG } from '@/lib/llm/catalog'

// ─── Registry de providers de LLM ────────────────────────────────────────────
//
// Fonte ÚNICA de verdade dos providers suportados. Todo o resto da feature de
// LLM Config (lib/llm-provider.ts, a UI de /admin/llm-config, a validação das
// rotas admin) deriva DAQUI — nada de provider hardcoded espalhado.
//
// ADICIONAR UM PROVIDER NOVO (ex.: Claude/Anthropic, Qwen) = 3 passos:
//   1. Instalar o pacote do AI SDK (ex.: `@ai-sdk/anthropic`).
//   2. Adicionar UMA entrada em PROVIDERS abaixo (models, defaultModel, envKey,
//      makeModel, ownsModel, resolveModelId).
//   3. Adicionar o provider ao union LlmProvider (lib/types.ts), ao CHECK das
//      migrations (099/088) e semear pricing em llm_pricing.
// Zero mudança no pipeline (/api/analyze e os serviços) — todos passam por
// getActiveLlmModel(), que consulta este registry.

export interface ProviderDef {
  id: LlmProvider
  /** Rótulo humano (fallback quando i18n não cobre). */
  label: string
  /** Modelos selecionáveis na UI. O primeiro é o default sugerido. */
  models: string[]
  defaultModel: string
  /** Variável de ambiente usada como fallback quando não há chave no banco. */
  envKey: string
  supportsAnalysis: boolean
  /** Só OpenAI transcreve áudio hoje (Whisper). Ver lib/services/whisper.ts. */
  supportsTranscription: boolean
  /** true se `modelName` (cru, possivelmente com prefixo) pertence a ESTE provider. */
  ownsModel(modelName?: string | null): boolean
  /** true se `modelName` é um modelo conhecido deste provider (sem fallback). */
  isValidModel(modelName?: string | null): boolean
  /** Normaliza um nome cru (prefixos/sufixos) → id canônico; default se inválido. */
  resolveModelId(modelName?: string | null): string
  /** Cria um LanguageModel. `apiKey` null → usa a env (envKey); lança se nenhuma existir. */
  makeModel(apiKey: string | null, modelId: string): LanguageModel
}

function requireKey(apiKey: string | null, envKey: string, providerLabel: string): string {
  const key = apiKey ?? process.env[envKey]
  if (!key) {
    throw new Error(
      `${providerLabel}: nenhuma chave configurada (nem no banco, nem em ${envKey}).`,
    )
  }
  return key
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────
const OPENAI_VALID = new Set(PROVIDER_CATALOG.openai.models)
const OPENAI_DEFAULT = PROVIDER_CATALOG.openai.defaultModel

const openaiDef: ProviderDef = {
  id: 'openai',
  label: PROVIDER_CATALOG.openai.label,
  models: PROVIDER_CATALOG.openai.models,
  defaultModel: OPENAI_DEFAULT,
  envKey: PROVIDER_CATALOG.openai.envKey,
  supportsAnalysis: true,
  supportsTranscription: true,
  // Qualquer coisa que NÃO seja claramente gemini/google é tratada como OpenAI.
  ownsModel: (modelName) => !/^(google\/|gemini)/.test((modelName ?? '').trim()),
  isValidModel: (modelName) => OPENAI_VALID.has((modelName ?? '').replace(/^openai\//, '').trim()),
  resolveModelId: (modelName) => {
    const sanitized = (modelName ?? '').replace(/^openai\//, '').trim()
    return OPENAI_VALID.has(sanitized) ? sanitized : OPENAI_DEFAULT
  },
  makeModel: (apiKey, modelId) =>
    createOpenAI({ apiKey: requireKey(apiKey, 'OPENAI_API_KEY', 'OpenAI') })(modelId),
}

// ─── Google Gemini ───────────────────────────────────────────────────────────
// Whitelist inclui as variantes pinadas "-001" que o resolveModelId normaliza.
const GEMINI_VALID = new Set([
  ...PROVIDER_CATALOG.gemini.models,
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite-001',
])
const GEMINI_DEFAULT = PROVIDER_CATALOG.gemini.defaultModel

const geminiDef: ProviderDef = {
  id: 'gemini',
  label: PROVIDER_CATALOG.gemini.label,
  models: PROVIDER_CATALOG.gemini.models,
  defaultModel: GEMINI_DEFAULT,
  envKey: PROVIDER_CATALOG.gemini.envKey,
  supportsAnalysis: true,
  supportsTranscription: false,
  ownsModel: (modelName) => /^(google\/|gemini)/.test((modelName ?? '').trim()),
  isValidModel: (modelName) => {
    const sanitized = (modelName ?? '').replace(/^(google\/|models\/)/, '').replace(/-001$/, '').trim()
    return GEMINI_VALID.has(sanitized) || GEMINI_VALID.has(`${sanitized}-001`)
  },
  // Remove prefixo google//models/ e sufixo "-001" (pricing só cobre nomes base).
  resolveModelId: (modelName) => {
    const sanitized = (modelName ?? '')
      .replace(/^(google\/|models\/)/, '')
      .replace(/-001$/, '')
      .trim()
    if (GEMINI_VALID.has(sanitized)) return sanitized
    if (GEMINI_VALID.has(`${sanitized}-001`)) return sanitized
    return GEMINI_DEFAULT
  },
  makeModel: (apiKey, modelId) =>
    createGoogleGenerativeAI({ apiKey: requireKey(apiKey, 'GOOGLE_AI_API_KEY', 'Google Gemini') })(
      modelId,
    ),
}

// ─── Tabela ──────────────────────────────────────────────────────────────────
export const PROVIDERS: Record<LlmProvider, ProviderDef> = {
  openai: openaiDef,
  gemini: geminiDef,
}

/** Todos os providers em ordem estável (p/ UI). */
export const PROVIDER_LIST: ProviderDef[] = Object.values(PROVIDERS)

/** Provider default do sistema — usado quando nada está ativo (fallback env). */
export const DEFAULT_PROVIDER: LlmProvider = 'openai'

export function getProviderDef(id: string): ProviderDef | null {
  return (PROVIDERS as Record<string, ProviderDef | undefined>)[id] ?? null
}

export function isValidProvider(id: string): id is LlmProvider {
  return id in PROVIDERS
}

// PROVIDER_MODELS (client-safe) vive em lib/llm/catalog.ts — a UI importa de lá
// pra não puxar os SDKs (@ai-sdk/*) pro bundle do browser.
