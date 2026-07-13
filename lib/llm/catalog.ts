import type { LlmProvider } from '@/lib/types'

// ─── Catálogo puro de providers/modelos (SEM imports de SDK) ───────────────────
//
// Dados estáticos seguros pra rodar TANTO no server (registry.ts) QUANTO no
// client (a UI de /admin/llm-config). Separado de registry.ts de propósito:
// registry.ts importa @ai-sdk/* (server-only) e não pode ir pro bundle do
// browser. Ao adicionar um provider, adicione aqui E no registry.

export interface ProviderCatalogEntry {
  label: string
  /** Modelos selecionáveis na UI. O primeiro é o default sugerido. */
  models: string[]
  defaultModel: string
  envKey: string
  supportsTranscription: boolean
}

export const PROVIDER_CATALOG: Record<LlmProvider, ProviderCatalogEntry> = {
  openai: {
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o',
    envKey: 'OPENAI_API_KEY',
    supportsTranscription: true,
  },
  gemini: {
    label: 'Google Gemini',
    models: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
    ],
    defaultModel: 'gemini-2.5-flash-lite',
    envKey: 'GOOGLE_AI_API_KEY',
    supportsTranscription: false,
  },
}

/** Modelos por provider — usado pela UI (client-safe). */
export const PROVIDER_MODELS: Record<LlmProvider, string[]> = Object.fromEntries(
  Object.entries(PROVIDER_CATALOG).map(([id, e]) => [id, e.models]),
) as Record<LlmProvider, string[]>
