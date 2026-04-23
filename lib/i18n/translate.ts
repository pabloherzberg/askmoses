import { createHash } from 'crypto'
import { generateObject } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { z } from 'zod'
import type { Locale } from '@/i18n/routing'

const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  pt: 'Brazilian Portuguese',
  es: 'Spanish',
  fr: 'French',
}

const SYSTEM_PROMPT = `You are a professional translator specialized in sales coaching content.
You will receive a JSON array of strings in {source}. Return a translations array where each entry corresponds 1:1 to the input at the same index, translated to {target}.

Rules:
- Preserve meaning, tone, and sales-coaching nuance.
- Keep product/technical terms untranslated when widely used in {target} (e.g. "script", "pipeline", "closing", "follow-up", "pitch", "DO's", "DON'Ts").
- Preserve inline formatting: line breaks, numeric values, percentages, currency, bullet prefixes ("-", "•", "1.").
- Keep the output count EXACTLY equal to the input count; never merge or split entries.`

// ─── Model chain ────────────────────────────────────────────────────────────

interface ModelAdapter {
  id: string
  run(system: string, items: string[]): Promise<string[] | null>
  isAvailable(): boolean
}

const TranslatedSchema = z.object({
  translations: z.array(z.string()),
})

const googleAdapter = (model: string): ModelAdapter => ({
  id: `google:${model}`,
  isAvailable: () => !!process.env.GOOGLE_AI_API_KEY,
  async run(system, items) {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
    // `generateObject` forces a response shape — Gemini cannot return prose or
    // malformed JSON. It also lifts the default text limit enough for large
    // batches of coaching text (~100+ strings).
    const { object } = await generateObject({
      model: google(model),
      system,
      prompt: JSON.stringify(items),
      schema: TranslatedSchema,
      temperature: 0,
      maxOutputTokens: 8192,
    })
    return object.translations
  },
})

// Preference order: higher-quota first. `gemini-2.5-flash` is intentionally
// NOT included — its free tier is only 20 req/day, which is exhausted in
// minutes of normal use and provides no practical fallback benefit.
const MODEL_CHAIN: ModelAdapter[] = [
  googleAdapter('gemini-2.5-flash-lite'), // free tier: 1,000 req/day
  googleAdapter('gemini-2.0-flash'),      // free tier: 1,500 req/day
]

// ─── Cooldown tracking (per model, per process) ────────────────────────────
//
// State is attached to `globalThis` so it survives Next.js dev HMR cycles —
// otherwise a hot reload would wipe the cooldown map and immediately retry
// models that are still rate-limited.

type TranslateState = {
  cooldowns: Map<string, number>
  cache: Map<string, { value: string[]; expiresAt: number }>
}

const globalKey = Symbol.for('askmoses.translate.state')
type GlobalWithState = typeof globalThis & { [globalKey]?: TranslateState }
const g = globalThis as GlobalWithState
const state: TranslateState = g[globalKey] ?? (g[globalKey] = {
  cooldowns: new Map(),
  cache: new Map(),
})

const cooldowns = state.cooldowns

function isOnCooldown(id: string): boolean {
  const until = cooldowns.get(id)
  if (!until) return false
  if (Date.now() >= until) {
    cooldowns.delete(id)
    return false
  }
  return true
}

function setCooldown(id: string, ms: number) {
  cooldowns.set(id, Date.now() + ms)
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /\b429\b/.test(msg) || /rate.?limit/i.test(msg) || /quota/i.test(msg) || /Too Many Requests/i.test(msg)
}

function parseRetryDelayMs(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err)
  // Google returns `"retryDelay":"46s"` or `Please retry in 46.695509398s`
  const s1 = msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)
  if (s1) return Math.ceil(parseFloat(s1[1])) * 1000
  const s2 = msg.match(/retry in (\d+(?:\.\d+)?)s/i)
  if (s2) return Math.ceil(parseFloat(s2[1])) * 1000
  // OpenAI: "Please try again in 20.5s"
  const s3 = msg.match(/try again in (\d+(?:\.\d+)?)s/i)
  if (s3) return Math.ceil(parseFloat(s3[1])) * 1000
  return 60_000 // default: 1 min
}

// ─── In-memory cache with TTL ──────────────────────────────────────────────
//
// Respects the product decision of "no DB persistence": cache lives in the
// Node process and is wiped on restart/deploy. TTL is short (10 min) so the
// first request after a locale change IS always a cache miss — only repeat
// views of the same content within the TTL benefit.

const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX_SIZE = 500

const cache = state.cache

function cacheKey(strings: string[], sourceLocale: Locale, targetLocale: Locale): string {
  const h = createHash('sha1')
  h.update(sourceLocale).update('|').update(targetLocale).update('|')
  for (const s of strings) h.update(s).update('\x01')
  return h.digest('hex')
}

function cacheGet(key: string): string[] | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() >= hit.expiresAt) {
    cache.delete(key)
    return null
  }
  // LRU: re-insert to mark as recently used
  cache.delete(key)
  cache.set(key, hit)
  return hit.value
}

function cacheSet(key: string, value: string[]): void {
  if (cache.size >= CACHE_MAX_SIZE) {
    // Evict oldest entry (Map iteration is insertion order)
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Translate an array of strings to the target locale.
 *
 * - Returns the input unchanged when target===source or the array is empty.
 * - Uses a process-level in-memory cache (TTL {@link CACHE_TTL_MS}) keyed on
 *   the full string list. A locale switch invalidates naturally (different key).
 * - On failure tries the next model in {@link MODEL_CHAIN}. A model that hits
 *   rate limit is placed on cooldown for the duration reported by the provider.
 * - Ultimate fallback: returns the source strings unchanged so pages never break.
 */
export async function translateStrings(
  strings: string[],
  targetLocale: Locale,
  sourceLocale: Locale = 'en',
): Promise<string[]> {
  if (targetLocale === sourceLocale) return strings
  if (strings.length === 0) return strings
  // Dev escape hatch: set TRANSLATE_COACHING=false in .env.local to bypass
  // the LLM entirely while working on UI (no quota burn, no latency).
  if (process.env.TRANSLATE_COACHING === 'false') return strings
  if (!process.env.GOOGLE_AI_API_KEY) {
    console.warn('[translate] GOOGLE_AI_API_KEY missing → returning source strings')
    return strings
  }

  const indexed = strings.map((s, i) => ({ s, i }))
  const toTranslate = indexed.filter(({ s }) => s.trim().length > 0)
  if (toTranslate.length === 0) return strings

  const payload = toTranslate.map(({ s }) => s)

  // Cache lookup
  const key = cacheKey(payload, sourceLocale, targetLocale)
  const cached = cacheGet(key)
  if (cached) {
    return mergeTranslations(strings, toTranslate, cached)
  }

  // Model chain with cooldown skipping
  const system = SYSTEM_PROMPT
    .replace(/\{source\}/g, LOCALE_NAMES[sourceLocale])
    .replace(/\{target\}/g, LOCALE_NAMES[targetLocale])

  for (const adapter of MODEL_CHAIN) {
    if (!adapter.isAvailable()) continue
    if (isOnCooldown(adapter.id)) continue

    try {
      const translated = await adapter.run(system, payload)
      if (!translated) {
        console.warn(`[translate] ${adapter.id} returned no output, trying next model`)
        continue
      }
      // Accept partial responses. If the LLM returned fewer items than we sent,
      // fill the tail with source strings instead of rejecting the whole batch.
      if (translated.length !== payload.length) {
        console.warn(
          `[translate] ${adapter.id} returned ${translated.length}/${payload.length} items — padding with source for missing`,
        )
      }
      const result = payload.map((original, i) => {
        const t = translated[i]
        return typeof t === 'string' && t.length > 0 ? t : original
      })
      cacheSet(key, result)
      return mergeTranslations(strings, toTranslate, result)
    } catch (err) {
      if (isRateLimitError(err)) {
        const ms = parseRetryDelayMs(err)
        setCooldown(adapter.id, ms)
        console.warn(`[translate] ${adapter.id} hit rate limit, cooling down for ${Math.round(ms / 1000)}s`)
        continue
      }
      console.error(`[translate] ${adapter.id} failed:`, err instanceof Error ? err.message : err)
      continue
    }
  }

  // All models exhausted → graceful fallback
  console.warn('[translate] all models unavailable, returning source strings')
  return strings
}

function mergeTranslations(
  original: string[],
  toTranslate: { s: string; i: number }[],
  translated: string[],
): string[] {
  const out = [...original]
  toTranslate.forEach(({ i }, idx) => {
    const t = translated[idx]
    if (typeof t === 'string') out[i] = t
  })
  return out
}

