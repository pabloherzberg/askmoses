// Shared model chain + cooldown tracking for Gemini calls across the app.
// Endpoints (translate, coaching recs, etc.) reuse the same cooldown map via
// globalThis so a 429 in one place skips the model everywhere until the
// provider-reported retry delay elapses.

// Preference order: higher-quota first. As of 2025-Q4 Google has heavily
// reduced the free tier — most Gemini models now sit around 20 RPD on free
// (the metric `generate_content_free_tier_requests` is shared/per-model with
// a tiny daily allowance). This chain is therefore only useful while a paid
// key is unavailable; production should use a paid API key.
export const GEMINI_MODEL_CHAIN = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
] as const

// Cooldowns live on globalThis so they survive Next.js dev HMR cycles —
// otherwise a hot reload would wipe the map and immediately retry models that
// are still rate-limited. `globalPauseUntil` is set when ALL models fail in a
// single chain run, so concurrent/subsequent requests with different payloads
// don't keep hammering Gemini and renewing the cooldowns indefinitely.
// `successCount` is a dev-only per-process counter (resets on restart) — gives
// a lower bound estimate of "how much of the daily quota did I burn this
// session" so you can correlate with the Cloud Console quotas page.
type ModelStats = { successes: number; lastQuotaId?: string }
type CooldownState = {
  cooldowns: Map<string, number>
  globalPauseUntil: number
  stats: Map<string, ModelStats>
}
const stateKey = Symbol.for('askmoses.gemini.chain')
type GlobalWithState = typeof globalThis & { [stateKey]?: CooldownState }
const g = globalThis as GlobalWithState
const state: CooldownState =
  g[stateKey] ?? (g[stateKey] = { cooldowns: new Map(), globalPauseUntil: 0, stats: new Map() })

const IS_DEV = process.env.NODE_ENV !== 'production'

// Free-tier daily allowances vary wildly (and are aggressively reduced by
// Google over time — flash-lite was 20 RPD on 2026-05). On a paid key the
// real ceiling is orders of magnitude higher and we can't reliably tell from
// the SDK whether the caller is on free vs paid. So we just log the session
// success count without a denominator — Cloud Console is the authoritative
// source for "X of Y used".

// Maps a Google quota metric/id to a short human label. Two formats observed:
//   1. JSON QuotaFailure: `GenerateRequestsPer{Minute,Day}PerProjectPerModel-FreeTier`
//   2. Plain-text 429: `generativelanguage.googleapis.com/generate_content_free_tier_requests`
function quotaLabel(quotaId: string | undefined): string {
  if (!quotaId) return 'unknown quota'
  // Plain-text Google metric (current format)
  if (/free_tier_requests$/i.test(quotaId)) return 'RPD (requests/day, free tier)'
  if (/free_tier_input_token/i.test(quotaId)) return 'TPD (tokens/day, free tier)'
  // Classic QuotaFailure shapes
  if (/PerMinute/i.test(quotaId) && /Tokens/i.test(quotaId)) return 'TPM (tokens/min)'
  if (/PerDay/i.test(quotaId) && /Tokens/i.test(quotaId))    return 'TPD (tokens/day)'
  if (/PerMinute/i.test(quotaId)) return 'RPM (requests/min)'
  if (/PerDay/i.test(quotaId))    return 'RPD (requests/day)'
  return quotaId
}

interface RateLimitInfo {
  quotaId?: string
  quotaValue?: string
}

// Pulls `quotaId` and `quotaValue` out of the Google 429 error. We regex it
// out instead of depending on the SDK's typed error shape (varies by version).
// Both observed formats are tried: structured JSON QuotaFailure AND the
// plain-text "Quota exceeded for metric: X, limit: Y, model: Z" form.
function parseRateLimitInfo(err: unknown): RateLimitInfo {
  const msg = err instanceof Error ? err.message : String(err)
  const idMatch =
    msg.match(/"quotaId"\s*:\s*"([^"]+)"/) ??
    msg.match(/metric:\s*([\w./-]+)/i) ??
    msg.match(/quotaMetric[:=]?\s*['"]?([\w./-]+)/i)
  // For limit, prefer the one IMMEDIATELY after the metric — avoids matching
  // unrelated "limit:0" that may appear elsewhere in the error blob.
  const valMatch =
    msg.match(/"quotaValue"\s*:\s*"?(\d+)"?/) ??
    msg.match(/metric:[^,]+,\s*limit:\s*(\d+)/i) ??
    msg.match(/quotaValue[:=]?\s*['"]?(\d+)/i)
  return { quotaId: idMatch?.[1], quotaValue: valMatch?.[1] }
}

// Dev-only: dump the raw 429 body ONCE PER MODEL so we see each provider's
// error shape. Without this we'd only see the first model's format and miss
// shape differences across models.
const rawDumped = new Set<string>()
function dumpRawIfUnknown(name: string, err: unknown, info: RateLimitInfo) {
  if (!IS_DEV || rawDumped.has(name)) return
  // Only dump when we either couldn't parse the metric OR the limit looks wrong.
  if (info.quotaId && info.quotaValue) return
  rawDumped.add(name)
  const msg = err instanceof Error ? err.message : String(err)
  console.warn(
    `[gemini-chain] (DEV) raw 429 from ${name} (one-shot per model):\n${msg}`,
  )
}

const modelId = (name: string) => `google:${name}`

export function isOnCooldown(name: string): boolean {
  const id = modelId(name)
  const until = state.cooldowns.get(id)
  if (!until) return false
  if (Date.now() >= until) {
    state.cooldowns.delete(id)
    return false
  }
  return true
}

export function setCooldown(name: string, ms: number) {
  state.cooldowns.set(modelId(name), Date.now() + ms)
}

export function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /\b429\b/.test(msg) || /rate.?limit/i.test(msg) || /quota/i.test(msg) || /Too Many Requests/i.test(msg)
}

export function parseRetryDelayMs(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err)
  // Google: `"retryDelay":"46s"` or `Please retry in 46.695509398s`
  const s1 = msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)
  if (s1) return Math.ceil(parseFloat(s1[1])) * 1000
  const s2 = msg.match(/retry in (\d+(?:\.\d+)?)s/i)
  if (s2) return Math.ceil(parseFloat(s2[1])) * 1000
  // OpenAI-style: "Please try again in 20.5s"
  const s3 = msg.match(/try again in (\d+(?:\.\d+)?)s/i)
  if (s3) return Math.ceil(parseFloat(s3[1])) * 1000
  return 60_000 // default: 1 min
}

/**
 * Try `attempt(modelName)` against each model in the chain, skipping any on
 * cooldown. On rate-limit (429/quota), place the model on cooldown for the
 * provider-reported delay and try the next. Any other error logs and continues
 * — useful for non-rate-limit failures like malformed JSON from one model that
 * another might handle. Returns null when the chain is exhausted.
 *
 * Global pause: when the chain exhausts all models in a single run, we mark
 * the whole chain paused until the soonest model recovers. Subsequent calls
 * (often with different payloads, so different cache keys) return null
 * immediately instead of generating another set of 429s. This breaks the
 * death-spiral where parallel requests keep renewing each other's cooldowns.
 */
export async function runWithGeminiChain<T>(
  attempt: (modelName: string) => Promise<T>,
  models: readonly string[] = GEMINI_MODEL_CHAIN,
): Promise<T | null> {
  const now = Date.now()
  if (now < state.globalPauseUntil) {
    if (IS_DEV) {
      const waitS = Math.round((state.globalPauseUntil - now) / 1000)
      console.warn(`[gemini-chain] skipped: global pause active for ${waitS}s more`)
    }
    return null
  }

  for (const name of models) {
    if (isOnCooldown(name)) {
      if (IS_DEV) {
        const waitS = Math.round(((state.cooldowns.get(modelId(name)) ?? now) - now) / 1000)
        console.warn(`[gemini-chain] ${name} skipped: still on cooldown for ${waitS}s`)
      }
      continue
    }
    try {
      const out = await attempt(name)
      // Success → clear any lingering global pause so the next call goes through.
      state.globalPauseUntil = 0
      if (IS_DEV) {
        const s = state.stats.get(name) ?? { successes: 0 }
        s.successes += 1
        state.stats.set(name, s)
        console.log(`[gemini-chain] ${name} ok — ${s.successes} requests this session`)
      }
      return out
    } catch (err) {
      if (isRateLimitError(err)) {
        const ms = parseRetryDelayMs(err)
        setCooldown(name, ms)
        if (IS_DEV) {
          const info = parseRateLimitInfo(err)
          const s = state.stats.get(name) ?? { successes: 0 }
          s.lastQuotaId = info.quotaId
          state.stats.set(name, s)
          const label = quotaLabel(info.quotaId)
          const limit = info.quotaValue ? ` (limit: ${info.quotaValue})` : ''
          const usage = ` — session successes: ${s.successes}`
          console.warn(
            `[gemini-chain] ${name} 429 ${label}${limit} — cooldown ${Math.round(ms / 1000)}s${usage}`,
          )
          dumpRawIfUnknown(name, err, info)
        } else {
          console.warn(`[gemini-chain] ${name} hit rate limit, cooling down for ${Math.round(ms / 1000)}s`)
        }
        continue
      }
      console.error(`[gemini-chain] ${name} failed:`, err instanceof Error ? err.message : err)
      continue
    }
  }

  // All models exhausted. Pause until the soonest cooldown expires.
  const cooldownExpiries = models
    .map((n) => state.cooldowns.get(modelId(n)) ?? 0)
    .filter((t) => t > Date.now())
  if (cooldownExpiries.length > 0) {
    state.globalPauseUntil = Math.min(...cooldownExpiries)
    const waitMs = state.globalPauseUntil - Date.now()
    console.warn(`[gemini-chain] all models exhausted, pausing chain for ${Math.round(waitMs / 1000)}s`)
  }
  return null
}
