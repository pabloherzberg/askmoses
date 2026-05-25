import { createHash } from 'crypto'
import { generateObject } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { z } from 'zod'
import type { Locale } from '@/i18n/routing'
import { runWithGeminiChain } from '@/lib/gemini-chain'

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

const TranslatedSchema = z.object({
  translations: z.array(z.string()),
})

// ─── In-memory cache with TTL ──────────────────────────────────────────────
//
// Respects the product decision of "no DB persistence": cache lives in the
// Node process and is wiped on restart/deploy.
//
// Two TTLs:
//   - Success: 24h. The source text rarely changes — long TTL maximises hits
//     and keeps us well under the Gemini RPM/RPD limits across page reloads.
//   - Failure (all models on cooldown): 60s. Short cache of the source so
//     concurrent/subsequent requests don't re-hit Gemini while the per-minute
//     rate-limit bucket recovers.

const CACHE_TTL_SUCCESS_MS = 24 * 60 * 60 * 1000
const CACHE_TTL_FAILURE_MS = 60 * 1000
const CACHE_MAX_SIZE = 2000

// Cache lives on globalThis to survive Next.js dev HMR (model cooldowns are
// shared in @/lib/gemini-chain — this state is just translate-specific cache).
// `inflight` tracks Promises for cache keys currently being resolved, so two
// concurrent requests with the same payload (very common in React Strict Mode
// double-fire + parallel page loads) share one LLM call instead of racing.
type TranslateCacheState = {
  cache: Map<string, { value: string[]; expiresAt: number }>
  inflight: Map<string, Promise<string[]>>
}
const cacheKey_ = Symbol.for('askmoses.translate.cache')
type GlobalWithCache = typeof globalThis & { [cacheKey_]?: TranslateCacheState }
const gc = globalThis as GlobalWithCache
const _state = gc[cacheKey_] ?? (gc[cacheKey_] = { cache: new Map(), inflight: new Map() })
const cache = _state.cache
const inflight = _state.inflight

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

function cacheSet(key: string, value: string[], ttlMs: number = CACHE_TTL_SUCCESS_MS): void {
  if (cache.size >= CACHE_MAX_SIZE) {
    // Evict oldest entry (Map iteration is insertion order)
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
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

  // In-flight dedup: if another request is already translating this exact
  // payload, await its Promise instead of firing a parallel LLM call. Saves
  // duplicate cost from Strict Mode double-fire and concurrent page loads.
  const ongoing = inflight.get(key)
  if (ongoing) {
    const result = await ongoing
    return mergeTranslations(strings, toTranslate, result)
  }

  const system = SYSTEM_PROMPT
    .replace(/\{source\}/g, LOCALE_NAMES[sourceLocale])
    .replace(/\{target\}/g, LOCALE_NAMES[targetLocale])

  // Wrap the chain + post-processing in a single Promise so concurrent callers
  // (Strict Mode dup, parallel page loads) share one LLM call via `inflight`.
  // The wrapped Promise always resolves to a string[] of payload.length —
  // translated on success, source on failure — caller merges back into `strings`.
  const work: Promise<string[]> = (async () => {
    // `generateObject` forces a response shape — Gemini cannot return prose or
    // malformed JSON. `maxOutputTokens: 8192` lifts the default limit enough
    // for large batches of coaching text (~100+ strings).
    const result = await runWithGeminiChain<string[]>(async (modelName) => {
      const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
      const { object } = await generateObject({
        model: google(modelName),
        system,
        prompt: JSON.stringify(payload),
        schema: TranslatedSchema,
        temperature: 0,
        maxOutputTokens: 8192,
      })
      const translated = object.translations
      // Empty / drastically-truncated output → throw so the chain tries the
      // next model instead of "succeeding" with all-source strings.
      if (translated.length === 0) {
        throw new Error(`${modelName} returned 0 translations for ${payload.length} inputs`)
      }
      if (translated.length < payload.length) {
        console.warn(
          `[translate] ${modelName} returned ${translated.length}/${payload.length} items — padding tail with source`,
        )
      }
      return payload.map((original, i) => {
        const t = translated[i]
        return typeof t === 'string' && t.length > 0 ? t : original
      })
    })
    return result ?? payload
  })()

  inflight.set(key, work)
  let result: string[]
  try {
    result = await work
  } finally {
    inflight.delete(key)
  }

  // Chain returned source (null path) → cache short and bail.
  if (result === payload) {
    console.warn('[translate] all models unavailable, returning source (short cache)')
    cacheSet(key, payload, CACHE_TTL_FAILURE_MS)
    return strings
  }

  // Don't cache identity results — happens when the LLM returned a usable
  // shape but every entry got padded to source (degraded quality, language
  // mismatch). Caching would lock the page in source for the long TTL.
  const translatedCount = result.reduce(
    (n, v, i) => (v !== payload[i] ? n + 1 : n),
    0,
  )
  if (translatedCount === 0) {
    console.warn('[translate] result identical to source — not caching')
    return strings
  }

  cacheSet(key, result)
  return mergeTranslations(strings, toTranslate, result)
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

