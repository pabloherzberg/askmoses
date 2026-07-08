import { type NextRequest } from 'next/server'
import { forbidden, getActiveOrgContext, getSession, ok, unauthorized } from '@/lib/auth'
import { executeMarketingRun, NoClosedCallsError } from '@/lib/services/marketing-intelligence'
import { translateMarketingIntelligence } from '@/lib/i18n/translate-coaching'
import { routing } from '@/i18n/routing'
import type { Locale } from '@/i18n/routing'

function resolveLocale(raw: string | null): Locale {
  if (raw && (routing.locales as readonly string[]).includes(raw)) return raw as Locale
  return 'en'
}

// POST /api/marketing-intelligence/run
//   RUN NOW — restricted to AskMoses super-admins (TC-09). Owners read the
//   latest cached run via GET /api/marketing-intelligence; only admin can
//   force a fresh LLM execution. O run é gerado/cacheado em inglês; traduzimos
//   a resposta por locale (x-locale) só pra exibição.
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  // Super-admin check is on the JWT (app_metadata.role === 'admin'), not the
  // org-context role — owners of an org never satisfy this.
  const isSuperAdmin = session.user.app_metadata?.role === 'admin'
  if (!isSuperAdmin) return forbidden()

  const ctx = await getActiveOrgContext()
  if (!ctx?.activeOrgId) return forbidden()

  const locale = resolveLocale(request.headers.get('x-locale'))

  try {
    const data = await executeMarketingRun({
      orgId: ctx.activeOrgId,
      trigger: 'manual',
      createdBy: session.user.id,
    })
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
    console.error('[marketing-intelligence/run] POST failed:', message)
    return Response.json(
      { data: null, error: { message: 'Failed to run Marketing Intelligence analysis.', code: 500 } },
      { status: 500 },
    )
  }
}
