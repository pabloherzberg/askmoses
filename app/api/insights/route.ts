import { type NextRequest } from 'next/server'
import { ok, unauthorized, forbidden, requireActiveSubscription } from '@/lib/auth'
import { getSession, getRole } from '@/lib/auth'
import { getInsights, generateInsights } from '@/lib/services/insights'
import { translateInsights, type InsightsPayload } from '@/lib/i18n/translate-coaching'
import { routing, type Locale } from '@/i18n/routing'

function resolveLocale(raw: string | null): Locale {
  if (raw && (routing.locales as readonly string[]).includes(raw)) return raw as Locale
  return routing.defaultLocale
}

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  // Subscription gate: sub-inactive não vê insights (dados + custo LLM no POST).
  const subErr = await requireActiveSubscription()
  if (subErr) return subErr

  const data = await getInsights()
  return ok(data)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const subErr = await requireActiveSubscription()
  if (subErr) return subErr

  const role = await getRole()
  if (role === 'trainer') return forbidden()

  try {
    const body = await request.json() as { scriptId?: string }
    // Client sends current locale via the `x-locale` header (added to the fetch
    // in the insights page). On every language switch the UI re-requests the
    // insights, so translation is always fresh and never cached server-side.
    const locale = resolveLocale(request.headers.get('x-locale'))
    const data = await generateInsights(body.scriptId) as InsightsPayload
    const translated = locale === 'en' ? data : await translateInsights(data, locale)
    return ok(translated)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[insights] Error:', message)
    return Response.json({ data: null, error: { message, code: 500 } }, { status: 500 })
  }
}
