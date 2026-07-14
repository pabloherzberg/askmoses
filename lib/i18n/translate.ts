import { createHash } from 'crypto'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { Locale } from '@/i18n/routing'
// Provider/chave do provider ATIVO (getActiveLlmModel) — tradução i18n segue o
// provider global. Fora do tuning por módulo (mantém temperature=0). Ver
// lib/constants/ai-modules.ts.
import { getActiveLlmModel } from '@/lib/llm-provider'
import { recordLlmUsage } from '@/lib/services/llm-usage'

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
//     and keeps the LLM cost/rate-limit footprint low across page reloads.
//   - Failure (LLM call failed): 60s. Short cache of the source so
//     concurrent/subsequent requests don't re-hit the LLM while it recovers.

const CACHE_TTL_SUCCESS_MS = 24 * 60 * 60 * 1000
const CACHE_TTL_FAILURE_MS = 60 * 1000
const CACHE_MAX_SIZE = 2000

// Cache lives on globalThis to survive Next.js dev HMR.
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
 * - Uses a process-level in-memory cache (TTL {@link CACHE_TTL_SUCCESS_MS})
 *   keyed on the full string list. A locale switch invalidates naturally.
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
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[translate] OPENAI_API_KEY missing → returning source strings')
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
    // `generateObject` forces a response shape — the model cannot return prose
    // or malformed JSON. `maxOutputTokens: 8192` lifts the default limit enough
    // for large batches of coaching text (~100+ strings). On any failure we
    // return the source payload so pages never break.
    try {
      const { model, provider, modelId } = await getActiveLlmModel('gpt-4o-mini')
      const { object, usage } = await generateObject({
        model,
        system,
        prompt: JSON.stringify(payload),
        schema: TranslatedSchema,
        temperature: 0,
        maxOutputTokens: 8192,
      })
      // Telemetria de custo p/ COGS (best-effort). orgId=null: tradução i18n não
      // é atribuível a uma org → fica fora do COGS por-org, mas o custo é registrado.
      void recordLlmUsage({
        orgId: null,
        surface: 'translation',
        provider,
        model: modelId,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
      })
      const translated = object.translations
      if (translated.length === 0) {
        throw new Error(`returned 0 translations for ${payload.length} inputs`)
      }
      if (translated.length < payload.length) {
        console.warn(
          `[translate] returned ${translated.length}/${payload.length} items — padding tail with source`,
        )
      }
      return payload.map((original, i) => {
        const t = translated[i]
        return typeof t === 'string' && t.length > 0 ? t : original
      })
    } catch (err) {
      console.warn('[translate] LLM call failed, returning source:', err)
      return payload
    }
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

