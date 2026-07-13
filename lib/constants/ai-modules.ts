import type { AiModuleId } from '@/lib/types'

// ─── Mapa módulo de IA → serviços do código ───────────────────────────────────
//
// Os 3 "módulos" de /admin/llm-config são uma abstração de PRODUTO. Eles não
// batem 1:1 com um arquivo — cada um governa o tuning (temperature/max_tokens)
// de um GRUPO de serviços. Este é o contrato: se você criar/mover um serviço
// de LLM, atualize o grupo correspondente aqui E o comentário de ownership no
// topo do serviço, pra que o slider da tela continue refletindo o que roda.
//
// IMPORTANTE (dois eixos, não confundir):
//   - PROVIDER + CHAVE  → global, vale pra TODOS os serviços de LLM, via
//     getActiveLlmModel() (lib/llm-provider.ts). Trocar o provider reflete em
//     tudo.
//   - TUNING por módulo → só os serviços listados abaixo. coaching, whisper,
//     i18n/translate, generate-script e scripts/improve ficam FORA do tuning
//     (mantêm temperatura fixa), mas ainda resolvem provider+chave do banco.

export const AI_MODULE_IDS: readonly AiModuleId[] = [
  'scoring_engine',
  'correlation_engine',
  'marketing_intelligence',
] as const

/** Documentação executável do que cada módulo cobre (usada em comentários/tests). */
export const AI_MODULE_SERVICES: Record<AiModuleId, string[]> = {
  scoring_engine: [
    'app/api/analyze/route.ts',
    'lib/services/scoring.ts',
    'lib/services/intent-scoring.ts',
  ],
  correlation_engine: [
    'lib/script-intelligence/analyze.ts',
    'lib/script-gap/analyze.ts',
    'lib/services/insights.ts',
  ],
  marketing_intelligence: ['lib/services/marketing-intelligence.ts'],
}

// ─── Ranges válidos (espelham o CHECK da migration 101 e a UI) ────────────────
export const TEMP_MIN = 0.0
export const TEMP_MAX = 1.0
export const TOKENS_MIN = 100
export const TOKENS_MAX = 4000

// ─── Defaults por módulo ──────────────────────────────────────────────────────
// Fallback quando não há linha na tabela ai_module_configs (pré-migração ou
// query falhou). Espelham o seed da migration 101. max_tokens=2000 (não 1000):
// como o valor é aplicado como maxOutputTokens, um teto baixo truncaria o JSON
// de análise em rubricas grandes. Editável pela tela (até 4000).
export const AI_MODULE_DEFAULTS: Record<AiModuleId, { temperature: number; max_tokens: number }> = {
  scoring_engine: { temperature: 0.2, max_tokens: 2000 },
  correlation_engine: { temperature: 0.5, max_tokens: 2000 },
  marketing_intelligence: { temperature: 0.8, max_tokens: 2000 },
}

export function isAiModuleId(value: string): value is AiModuleId {
  return (AI_MODULE_IDS as readonly string[]).includes(value)
}

export function validateTemperature(value: number): string | null {
  if (!Number.isFinite(value) || value < TEMP_MIN || value > TEMP_MAX) {
    return `Temperature must be between ${TEMP_MIN.toFixed(1)} and ${TEMP_MAX.toFixed(1)}`
  }
  return null
}

export function validateMaxTokens(value: number): string | null {
  if (!Number.isInteger(value) || value < TOKENS_MIN || value > TOKENS_MAX) {
    return `Max tokens must be between ${TOKENS_MIN} and ${TOKENS_MAX}`
  }
  return null
}
