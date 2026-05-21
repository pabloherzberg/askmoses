import { type NextRequest } from 'next/server'
import { ok, unauthorized, getSession, getOrgId } from '@/lib/auth'
import {
  trainers as mockTrainers,
  bestCalls,
  worstCalls,
  trainerBehavioral,
  coachingRecs,
  performanceTrends,
  trainerTrends,
  type CoachingRec,
  type BehavioralDimension,
  type BehavioralTrendDimension,
} from '@/lib/mock-data'
import { dbGetTrainers } from '@/lib/db/trainers'
import { translateCoachingBundle } from '@/lib/i18n/translate-coaching'
import { routing, type Locale } from '@/i18n/routing'
import type { Trainer, CallsByTrainerMap, PerformanceTrendPoint } from '@/lib/types'

function resolveLocale(raw: string | null): Locale {
  if (raw && (routing.locales as readonly string[]).includes(raw)) return raw as Locale
  return routing.defaultLocale
}

// Personas mock — cada trainer real recebe uma (ciclando) pro conteúdo de
// coaching. `contentKey` indexa coachingRecs/trainerBehavioral/bestCalls/
// worstCalls/trainerTrends; `trendKey` indexa performanceTrends.
const PERSONAS = [
  { contentKey: 'marcus', trendKey: '00000000-0000-0000-0000-000000000301' },
  { contentKey: 'jamie',  trendKey: '00000000-0000-0000-0000-000000000302' },
  { contentKey: 'jordan', trendKey: '00000000-0000-0000-0000-000000000303' },
  { contentKey: 'taylor', trendKey: '00000000-0000-0000-0000-000000000304' },
] as const

// Retorna os dados do Team Command Center. As tabs são os trainers REAIS da
// org (id + email reais → permite enviar recomendação/email pra cada um); o
// conteúdo de coaching ainda é mock, atribuído por persona ciclada e
// re-chaveado por trainer.id real. Quando a org tem mais trainers que as 4
// personas, o mock se repete.
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const locale = resolveLocale(request.headers.get('x-locale'))

  let realTrainers: Trainer[] = []
  try {
    const orgId = await getOrgId()
    if (orgId) realTrainers = await dbGetTrainers({ orgId })
  } catch {
    realTrainers = []
  }
  // Sem trainers reais (org vazia / erro) → cai nas 4 personas mock pra a
  // demo não ficar vazia. Mantém os IDs sintéticos do mock-data.
  const trainerList = realTrainers.length > 0 ? realTrainers : mockTrainers

  // Conteúdo de coaching é mock — traduz uma vez (persona-keyed) e depois
  // re-chaveia por trainer.id real.
  let bundle = { bestCalls, worstCalls, trainerBehavioral, coachingRecs }
  if (locale !== 'en') {
    bundle = await translateCoachingBundle(bundle, locale)
  }

  const outTrainers: Trainer[] = []
  const outRecs: Record<string, CoachingRec[]> = {}
  const outBehavioral: Record<string, BehavioralDimension[]> = {}
  // `teamWeekly` alimenta Best/WorstCallsTeamWeekly — preservado fora do loop.
  const outBest: CallsByTrainerMap = { teamWeekly: bundle.bestCalls.teamWeekly ?? [] }
  const outWorst: CallsByTrainerMap = { teamWeekly: bundle.worstCalls.teamWeekly ?? [] }
  const outTrends: Record<string, BehavioralTrendDimension[]> = {}
  const outPerf: Record<string, PerformanceTrendPoint[]> = { team: performanceTrends.team }

  trainerList.forEach((rt, i) => {
    const persona = PERSONAS[i % PERSONAS.length]
    const mockT = mockTrainers[i % mockTrainers.length]
    // Display (score, close rate, rubrica…) vem da persona mock; a identidade
    // (id/name/email/avatar) é do trainer real pra envio funcionar.
    outTrainers.push({
      ...mockT,
      id: rt.id,
      name: rt.name,
      email: rt.email,
      avatar: rt.avatar,
      avatarColor: rt.avatarColor,
      ownerId: rt.ownerId ?? mockT.ownerId,
      orgId: rt.orgId,
    })
    outRecs[rt.id] = bundle.coachingRecs[persona.contentKey] ?? []
    outBehavioral[rt.id] = bundle.trainerBehavioral[persona.contentKey] ?? []
    outBest[rt.id] = bundle.bestCalls[persona.contentKey] ?? []
    outWorst[rt.id] = bundle.worstCalls[persona.contentKey] ?? []
    outTrends[rt.id] = trainerTrends[persona.contentKey] ?? []
    outPerf[rt.id] = performanceTrends[persona.trendKey] ?? []
  })

  return ok({
    trainers: outTrainers,
    bestCalls: outBest,
    worstCalls: outWorst,
    trainerBehavioral: outBehavioral,
    coachingRecs: outRecs,
    performanceTrends: outPerf,
    trainerTrends: outTrends,
  })
}
