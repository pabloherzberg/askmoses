import { defaultSettingsMiddleware, wrapLanguageModel } from 'ai'
import { OPENAI_FORCE_REASONING_MODELS } from '@/lib/llm/catalog'

// Marca como "de raciocínio" os modelos OpenAI que o SDK não reconhece pelo
// prefixo (ver OPENAI_FORCE_REASONING_MODELS). Com forceReasoning o SDK usa
// o papel "developer" para o system prompt e DESCARTA temperature/topP com um
// aviso — então um módulo com tuning de temperatura (ai_module_configs) pode
// rodar num desses modelos sem erro de API.
//
// Qualquer outro modelo volta exatamente como veio (mesmo objeto).

type WrappableModel = Parameters<typeof wrapLanguageModel>[0]['model']

export function withOpenAIReasoning(model: WrappableModel, modelId: string): WrappableModel {
  if (!OPENAI_FORCE_REASONING_MODELS.has(modelId)) return model
  return wrapLanguageModel({
    model,
    middleware: defaultSettingsMiddleware({
      settings: { providerOptions: { openai: { forceReasoning: true } } },
    }),
  })
}
