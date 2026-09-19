import { type NextRequest } from 'next/server'
import { forbidden, getActiveOrgContext, getSession, ok, unauthorized } from '@/lib/auth'
import { getOrRunLatest, NoClosedCallsError } from '@/lib/services/marketing-intelligence'
import { translateMarketingIntelligence } from '@/lib/i18n/translate-coaching'
import { routing } from '@/i18n/routing'
import type { Locale } from '@/i18n/routing'

// nodejs + teto explícito: o GET dispara uma run INLINE quando a última passou
// de 7 dias (getOrRunLatest), então a chamada LLM inteira acontece dentro do
// request de quem abriu a tela. Sem isto a rota herdava o default da
// plataforma, muito abaixo dos 30–60s que a amostra maior leva.
export const runtime = 'nodejs'
export const maxDuration = 300

// O conteúdo (headlines/textos) é gerado e cacheado em INGLÊS (marketing_runs).
// A UI manda o idioma atual no header x-locale; traduzimos na leitura por locale.
function resolveLocale(raw: string | null): Locale {
  if (raw && (routing.locales as readonly string[]).includes(raw)) return raw as Locale
  return 'en'
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const ctx = await getActiveOrgContext()
  if (!ctx) return forbidden()

  // Only owner/admin see Marketing Intelligence. Trainer is blocked at the
  // middleware layer too; this is defense in depth for the API surface.
  if (ctx.role !== 'owner' && ctx.role !== 'admin') return forbidden()
  if (!ctx.activeOrgId) return forbidden()

  const locale = resolveLocale(request.headers.get('x-locale'))

  try {
    const data = await getOrRunLatest(ctx.activeOrgId, session.user.id)
    return ok(locale === 'en' ? data : await translateMarketingIntelligence(data, locale))
  } catch (err) {
    if (err instanceof NoClosedCallsError) {
      return Response.json(
        {
          data: null,
          error: {
            message: err.message,
            code: 422,
            reason: 'NO_CLOSED_CALLS',
          },
        },
        { status: 422 },
      )
    }
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('[marketing-intelligence] GET failed:', message)
    return Response.json(
      {
        data: null,
        error: {
          message: 'Marketing Intelligence is temporarily unavailable.',
          code: 500,
          reason: 'INTERNAL_ERROR',
        },
      },
      { status: 500 },
    )
  }
}
