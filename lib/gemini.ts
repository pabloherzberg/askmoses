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

export const VALID_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
])

// Default to flash-lite — free tier allows ~1,000 req/day vs. 20 req/day on
// the regular `gemini-2.5-flash`. Callers that need higher quality can pass an
// explicit model name (e.g. from the UI's model picker).
const DEFAULT_MODEL = 'gemini-2.5-flash-lite'

export function getGeminiModel(modelName?: string | null) {
  // Strip any "google/" or "models/" prefix that might come from the DB
  const sanitized = (modelName ?? '').replace(/^(google\/|models\/)/, '').trim()
  const model = VALID_MODELS.has(sanitized) ? sanitized : DEFAULT_MODEL
  return getGeminiClient().getGenerativeModel({ model })
}
