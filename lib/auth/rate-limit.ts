// Rate limiter in-memory por chave (email|ip|combo). Single-instance — em
// produção com múltiplos processos, trocar por Redis/Upstash. Para o estágio
// atual (demo + dev) é suficiente e bloqueia o vetor óbvio de spam de inbox.
//
// Para endpoints SENSÍVEIS (mudança de senha, impersonate, override de
// subscription) use checkRateLimitDb() abaixo — sobrevive multi-instance
// via tabela api_rate_limits (migration 041).

import { createAdminClient } from '@/lib/supabase/admin'

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }
  }

  bucket.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}

// Best-effort GC — chama esporadicamente pra evitar growth ilimitado
export function pruneExpiredBuckets(): void {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

// ─── DB-based rate limit (multi-instance safe) ─────────────────────────────
// Usa public.check_rate_limit() RPC (migration 041). Sobrevive cold start,
// múltiplas instâncias Vercel, e qualquer cenário onde in-memory falha.
// Preferir essa pra endpoints sensíveis (senha, impersonate, override).
//
// Fail-open: se a RPC errar, retorna allowed=true pra não bloquear users
// reais. Loga pra investigação.

export async function checkRateLimitDb(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('check_rate_limit', {
    p_key: key,
    p_max: limit,
    p_window_seconds: windowSeconds,
  })

  if (error) {
    console.error('[rate-limit] check_rate_limit RPC falhou (fail-open)', { key, error })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  return data === true
    ? { allowed: true, retryAfterSeconds: 0 }
    : { allowed: false, retryAfterSeconds: windowSeconds }
}

// Response helper pra 429 Too Many Requests com header Retry-After.
export function rateLimitedResponse(result: RateLimitResult): Response {
  return Response.json(
    {
      data: null,
      error: {
        message: 'Muitas tentativas. Aguarde alguns instantes e tente novamente.',
        code: 429,
        reason: 'RATE_LIMITED',
      },
    },
    {
      status: 429,
      headers: result.retryAfterSeconds > 0
        ? { 'Retry-After': String(result.retryAfterSeconds) }
        : undefined,
    },
  )
}
