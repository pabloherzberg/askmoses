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
  /**
   * Janela de contexto por modelo, em tokens de ENTRADA.
   *
   * Existe porque os modelos selecionáveis aqui não são intercambiáveis: um
   * prompt que cabe folgado em `gpt-4o` (128k) não cabe em `gpt-4` (8k). Os
   * serviços que montam prompt grande usam isto para rebaixar o modelo em vez
   * de falhar em runtime numa tela que o cliente acabou de abrir.
   *
   * Toda chave de `models` precisa de uma entrada aqui — há teste garantindo.
   */
  contextWindows: Record<string, number>
}

export const PROVIDER_CATALOG: Record<LlmProvider, ProviderCatalogEntry> = {
  openai: {
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o',
    envKey: 'OPENAI_API_KEY',
    supportsTranscription: true,
    contextWindows: {
      'gpt-4o': 128_000,
      'gpt-4o-mini': 128_000,
      'gpt-4-turbo': 128_000,
      'gpt-4': 8_192,
      'gpt-3.5-turbo': 16_385,
    },
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
    contextWindows: {
      'gemini-2.5-pro': 1_048_576,
      'gemini-2.5-flash': 1_048_576,
      'gemini-2.5-flash-lite': 1_048_576,
      'gemini-2.0-flash': 1_048_576,
      'gemini-2.0-flash-lite': 1_048_576,
    },
  },
}

/** Modelos por provider — usado pela UI (client-safe). */
export const PROVIDER_MODELS: Record<LlmProvider, string[]> = Object.fromEntries(
  Object.entries(PROVIDER_CATALOG).map(([id, e]) => [id, e.models]),
) as Record<LlmProvider, string[]>

/**
 * Janela de contexto de um modelo, em tokens de entrada.
 *
 * `null` = desconhecida — modelo fora do catálogo (id novo, sufixo de versão,
 * linha órfã depois de um rollback). Quem consome deve tratar desconhecido
 * como "não sei", nunca como "pequeno": rebaixar um modelo que talvez seja
 * melhor é pior que deixar passar.
 */
export function contextWindowFor(provider: LlmProvider, modelId: string): number | null {
  return PROVIDER_CATALOG[provider]?.contextWindows[modelId] ?? null
}
