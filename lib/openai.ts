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

const DEFAULT_MODEL = 'gpt-4o-mini'

export function getOpenAIModel(modelName?: string | null) {
  const sanitized = (modelName ?? '').trim()
  const model = VALID_MODELS.has(sanitized) ? sanitized : DEFAULT_MODEL
  return getOpenAIProvider()(model)
}
