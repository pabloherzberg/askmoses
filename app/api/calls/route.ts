import { type NextRequest } from 'next/server'
import { ok, unauthorized, forbidden, getSession, getRole, getTrainerDbId, requireActiveSubscription, requireOwnerWrite } from '@/lib/auth'
import { getCalls, createCall } from '@/lib/services/calls'
import type { CreateCallInput } from '@/lib/services/calls'
import { routing, type Locale } from '@/i18n/routing'

function resolveLocale(raw: string | null): Locale {
  if (raw && (routing.locales as readonly string[]).includes(raw)) return raw as Locale
  return routing.defaultLocale
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  // Subscription gate: owner/trainer sem sub ativa não vê calls. Admin bypassa.
  // Defense-in-depth: o FeatureGate no front é UI-only — sem isso aqui,
  // chamadas diretas via fetch ainda retornariam dados da org sub-inactive.
  const subErr = await requireActiveSubscription()
  if (subErr) return subErr

  const role = await getRole()
  const { searchParams } = request.nextUrl
  const callOutcome = searchParams.get('callOutcome') ?? undefined
  const rubricId = searchParams.get('rubricId') ?? undefined
  let limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined
  const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : undefined
  // Translation is opt-in: listings typically don't need the coaching text
  // (feedback/strengths/improvements only surface on detail). Callers that
  // DO show that text from the list response pass `?translate=true` to avoid
  // silently paying LLM cost for columns they never render.
  const wantsTranslation = searchParams.get('translate') === 'true'
  const locale = wantsTranslation ? resolveLocale(request.headers.get('x-locale')) : undefined

  // Trainer vê somente as próprias calls
  let trainerId: string | undefined
  if (role === 'trainer') {
    trainerId = (await getTrainerDbId()) ?? undefined
  } else {
    trainerId = searchParams.get('trainerId') ?? undefined
  }

  const callsData = await getCalls({ trainerId, callOutcome, rubricId, limit, offset, locale })

  // Filter by days if provided (Intent Dashboard)
  const days = searchParams.get('days') ? Number(searchParams.get('days')) : undefined
  if (days && Array.isArray(callsData)) {
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000
    const filtered = callsData.filter((call: any) => {
      const callTime = new Date(call.date).getTime()
      return callTime >= cutoffTime
    })
    return ok(filtered)
  }

  return ok(callsData)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const role = await getRole()
  if (role === 'trainer') return forbidden()

  const body = await request.json() as CreateCallInput
  const call = await createCall(body)
  return ok(call)
}
