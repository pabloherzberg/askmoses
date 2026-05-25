// Shared model chain + cooldown tracking for Gemini calls across the app.
// Endpoints (translate, coaching recs, etc.) reuse the same cooldown map via
// globalThis so a 429 in one place skips the model everywhere until the
// provider-reported retry delay elapses.

// Preference order: higher-quota first. Free tier (RPD) noted next to each.
// `gemini-2.5-flash` (20 RPD) is intentionally excluded — useless as fallback.
export const GEMINI_MODEL_CHAIN = [
  'gemini-2.5-flash-lite', // ~1,000 RPD
  'gemini-2.0-flash',      // ~1,500 RPD
  'gemini-2.0-flash-lite', // ~1,500 RPD
] as const

// Cooldowns live on globalThis so they survive Next.js dev HMR cycles —
// otherwise a hot reload would wipe the map and immediately retry models that
// are still rate-limited. `globalPauseUntil` is set when ALL models fail in a
// single chain run, so concurrent/subsequent requests with different payloads
// don't keep hammering Gemini and renewing the cooldowns indefinitely.
type CooldownState = {
  cooldowns: Map<string, number>
  globalPauseUntil: number
}
const stateKey = Symbol.for('askmoses.gemini.chain')
type GlobalWithState = typeof globalThis & { [stateKey]?: CooldownState }
const g = globalThis as GlobalWithState
const state: CooldownState =
  g[stateKey] ?? (g[stateKey] = { cooldowns: new Map(), globalPauseUntil: 0 })

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
  if (now < state.globalPauseUntil) return null

  for (const name of models) {
    if (isOnCooldown(name)) continue
    try {
      const out = await attempt(name)
      // Success → clear any lingering global pause so the next call goes through.
      state.globalPauseUntil = 0
      return out
    } catch (err) {
      if (isRateLimitError(err)) {
        const ms = parseRetryDelayMs(err)
        setCooldown(name, ms)
        console.warn(`[gemini-chain] ${name} hit rate limit, cooling down for ${Math.round(ms / 1000)}s`)
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
