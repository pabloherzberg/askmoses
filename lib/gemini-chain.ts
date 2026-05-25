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
// are still rate-limited.
type CooldownState = { cooldowns: Map<string, number> }
const stateKey = Symbol.for('askmoses.gemini.chain')
type GlobalWithState = typeof globalThis & { [stateKey]?: CooldownState }
const g = globalThis as GlobalWithState
const state: CooldownState = g[stateKey] ?? (g[stateKey] = { cooldowns: new Map() })

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
 */
export async function runWithGeminiChain<T>(
  attempt: (modelName: string) => Promise<T>,
  models: readonly string[] = GEMINI_MODEL_CHAIN,
): Promise<T | null> {
  for (const name of models) {
    if (isOnCooldown(name)) continue
    try {
      return await attempt(name)
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
  return null
}
