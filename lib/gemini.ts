import { GoogleGenerativeAI } from '@google/generative-ai'

let _client: GoogleGenerativeAI | null = null

export function getGeminiClient(): GoogleGenerativeAI {
  if (!_client) {
    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not configured in .env.local')
    _client = new GoogleGenerativeAI(apiKey)
  }
  return _client
}

const VALID_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
])

const DEFAULT_MODEL = 'gemini-2.5-flash'

export function getGeminiModel(modelName?: string | null) {
  // Strip any "google/" or "models/" prefix that might come from the DB
  const sanitized = (modelName ?? '').replace(/^(google\/|models\/)/, '').trim()
  const model = VALID_MODELS.has(sanitized) ? sanitized : DEFAULT_MODEL
  return getGeminiClient().getGenerativeModel({ model })
}
