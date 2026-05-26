import { type NextRequest } from 'next/server'
import { ok, unauthorized, getSession, getOrgId } from '@/lib/auth'
import { dbGetTrainers } from '@/lib/db/trainers'
import { dbGetActiveOrgScript } from '@/lib/db/scripts'
import { getCalls } from '@/lib/services/calls'
import { getPerformanceTrends } from '@/lib/services/trainers'
import {
  buildBehavioralProfile,
  buildBestWorstCalls,
  withLiveTrainerStats,
} from '@/lib/services/coaching'
import { translateStrings } from '@/lib/i18n/translate'
import { routing, type Locale } from '@/i18n/routing'
import type {
  Call,
  Trainer,
  CallsByTrainerMap,
  PerformanceTrendPoint,
} from '@/lib/types'
import type { BehavioralDimension } from '@/lib/mock-data'

function resolveLocale(raw: string | null): Locale {
  if (raw && (routing.locales as readonly string[]).includes(raw)) return raw as Locale
  return routing.defaultLocale
}

// Início da semana corrente (segunda-feira 00:00).
function startOfWeek(d: Date): number {
  const m = new Date(d)
  m.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  m.setHours(0, 0, 0, 0)
  return m.getTime()
}

// Team Command Center — dados reais da org. Tabs = trainers reais; conteúdo
// (behavioral profile/trends, best/worst calls, stats) é computado das calls
// reais. As coaching recommendations (IA) são carregadas sob demanda por
// trainer via GET /api/coaching/recommendations.
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const locale = resolveLocale(request.headers.get('x-locale'))
  const orgId = await getOrgId()

  const empty = {
    trainers: [],
    bestCalls: {},
    worstCalls: {},
    trainerBehavioral: {},
    performanceTrends: {},
  }
  if (!orgId) return ok(empty)

  const trainers = await dbGetTrainers({ orgId })
  if (trainers.length === 0) return ok(empty)

  // Fetch raw (untranslated) calls — translating 200 calls × ~6 strings each
  // in one batch would overflow `maxOutputTokens` and silently truncate; the
  // displayed best/worst would arrive in English. We translate only the 4
  // strings per trainer that actually render, in a tiny dedicated batch below.
  // Reaproveitamos o mesmo array `calls` em getPerformanceTrends pra evitar
  // duas queries idênticas pro Supabase em paralelo.
  //
  // activeScript define as DIMENSIONS do Behavioral Profile pra TODOS os
  // trainers da org (consistência horizontal). Sem ele, o builder cai pro
  // fallback (call mais recente do trainer) — comportamento legado.
  const [calls, activeScript] = await Promise.all([
    getCalls({ orgId, limit: 200 }),
    dbGetActiveOrgScript(orgId).catch(() => null),
  ])
  const performanceTrends = await getPerformanceTrends(trainers, calls)

  // Calls agrupadas por trainer.
  const callsByTrainer = new Map<string, Call[]>()
  for (const c of calls) {
    if (!c.trainerId) continue
    const list = callsByTrainer.get(c.trainerId)
    if (list) list.push(c)
    else callsByTrainer.set(c.trainerId, [c])
  }

  const weekStart = startOfWeek(new Date())

  // Enriquece todos os trainers PRIMEIRO (stats live + callsThisWeek +
  // lastActiveAt) — usa esse array em buildBehavioralProfile, hero card e
  // outBest/outWorst. Sem isso, qualquer trainer onde syncTrainerStats não
  // rodou (seed, GHL pipeline, retry, sync silenciosamente quebrado)
  // apareceria com close_rate/score/rubric=0 no Team Command Center mesmo
  // com 2+ calls reais analisadas.
  const enrichedTrainers: Trainer[] = trainers.map((trainer) => {
    const tc = callsByTrainer.get(trainer.id) ?? []
    const live = withLiveTrainerStats(trainer, tc)
    const callsThisWeek = tc.filter(
      (c) => new Date(c.date).getTime() >= weekStart,
    ).length
    // Última call do trainer — ISO bruto pro cliente formatar por locale.
    // Sem fallback: undefined → cliente cai no `lastActive` cacheado em EN.
    const lastAt = tc.length > 0
      ? tc.reduce((max, c) => {
          const t = new Date(c.date).getTime()
          return Number.isFinite(t) && t > max ? t : max
        }, 0)
      : 0
    return {
      ...live,
      callsThisWeek,
      lastActiveAt: lastAt > 0 ? new Date(lastAt).toISOString() : null,
    }
  })

  const outTrainers: Trainer[] = enrichedTrainers
  const outBehavioral: Record<string, BehavioralDimension[]> = {}
  const outBest: CallsByTrainerMap = {}
  const outWorst: CallsByTrainerMap = {}

  for (const trainer of enrichedTrainers) {
    const tc = callsByTrainer.get(trainer.id) ?? []
    // Behavioral usa as sections do script ATIVO como source of truth pra
    // dimensions (mesmas linhas pra todos os trainers). Score e teamAvg
    // são agregados das calls reais por nome (case-insensitive).
    outBehavioral[trainer.id] = buildBehavioralProfile(trainer, tc, calls, activeScript)
    const { best, worst } = buildBestWorstCalls(tc)
    outBest[trainer.id] = best
    outWorst[trainer.id] = worst
  }

  // Translate the `analysis` field of all displayed best/worst calls in a
  // single small batch. Far below the model's token budget — translation is
  // reliable here in a way it isn't when we batch all 200 calls upfront.
  if (locale !== 'en') {
    const displayed = [
      ...Object.values(outBest).flat(),
      ...Object.values(outWorst).flat(),
    ]
    if (displayed.length > 0) {
      const translated = await translateStrings(displayed.map((c) => c.analysis), locale)
      displayed.forEach((c, i) => {
        c.analysis = translated[i] ?? c.analysis
      })
    }
  }

  return ok({
    trainers: outTrainers,
    bestCalls: outBest,
    worstCalls: outWorst,
    trainerBehavioral: outBehavioral,
    performanceTrends: performanceTrends as Record<string, PerformanceTrendPoint[]>,
  })
}
