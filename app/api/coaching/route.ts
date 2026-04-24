import { type NextRequest } from 'next/server'
import { ok, unauthorized } from '@/lib/auth'
import { getSession } from '@/lib/auth'
import { trainers, bestCalls, worstCalls, trainerBehavioral, coachingRecs } from '@/lib/mock-data'
import { translateCoachingBundle } from '@/lib/i18n/translate-coaching'
import { routing, type Locale } from '@/i18n/routing'

function resolveLocale(raw: string | null): Locale {
  if (raw && (routing.locales as readonly string[]).includes(raw)) return raw as Locale
  return routing.defaultLocale
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const locale = resolveLocale(request.headers.get('x-locale'))
  if (locale === 'en') {
    return ok({ trainers, bestCalls, worstCalls, trainerBehavioral, coachingRecs })
  }

  const translated = await translateCoachingBundle(
    { bestCalls, worstCalls, trainerBehavioral, coachingRecs },
    locale,
  )
  return ok({ trainers, ...translated })
}
