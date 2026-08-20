import { type NextRequest } from 'next/server'
import { ok, unauthorized, getSession, getOrgId } from '@/lib/auth'
import { dbGetTrainers } from '@/lib/db/trainers'
import { dbGetActiveOrgScript } from '@/lib/db/scripts'
import { getCalls } from '@/lib/services/calls'
import { dbGetOrgWonRate } from '@/lib/db/calls'
import { getPerformanceTrends } from '@/lib/services/trainers'
import {
  buildBehavioralProfile,
  buildBestWorstCalls,
  withLiveTrainerStats,
} from '@/lib/services/coaching'
import { translateStrings } from '@/lib/i18n/translate'
import { routing, type Locale } from '@/i18n/routing'
import { intentSignals } from '@/lib/mock-data'
import type {
  Call,
  Trainer,
  CallsByTrainerMap,
  PerformanceTrendPoint,
  IntentSignal,
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
    intentSignals,
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
  //
  // wonRates NÃO sai de `calls`: aquele array é limitado a 200 e conta call,
  // e o won rate é global e contado por lead. Vem agregado do banco (RPC
  // org_won_rate). `.catch` porque a migration 107 pode não ter rodado ainda
  // num ambiente — o Team Command Center degrada sem o número em vez de
  // quebrar inteiro.
  const [calls, activeScript, wonRates] = await Promise.all([
    // salesOnly: alimenta best/worst calls, behavioral profile, callsThisWeek
    // e performance trends do Team Command Center — tudo métrica de venda.
    getCalls({ orgId, limit: 200, salesOnly: true }),
    dbGetActiveOrgScript(orgId).catch(() => null),
    dbGetOrgWonRate(orgId).catch((err) => {
      console.error('[api/coaching] won rate indisponível:', err)
      return null
    }),
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
    // ATENÇÃO ao consumir: wonRate NÃO compartilha a janela de closeRate e
    // score. Os dois últimos saem de `tc`, que é o recorte das 200 calls
    // mais recentes da org; wonRate vem do RPC e é histórico completo. Um
    // vendedor pode aparecer com closeRate de 5 calls e wonRate de 50 leads.
    // Não é bug: são perguntas diferentes, e estreitar o wonRate pra essa
    // janela exigiria contar lead dentro de um limite que é por call.
    //
    // Por isso o número real vai sempre que existir, mesmo com `tc` vazio —
    // omiti-lo ali esconderia dado verdadeiro pra imitar uma janela que ele
    // não usa.
    const won = wonRates?.byTrainer[trainer.id]
    return {
      ...live,
      callsThisWeek,
      lastActiveAt: lastAt > 0 ? new Date(lastAt).toISOString() : null,
      wonRate: won?.wonRate,
      closedLeads: won?.closedLeads,
      wonLeads: won?.wonLeads,
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

  // callsByTrainer como objeto plain (Map → Record) para serialização JSON.
  // Usado pelo TrainerTabs para radar de intent e Highest Priority Leads
  // sem precisar de um segundo fetch /api/calls?trainerId=X (que falharia
  // se as calls tiverem trainer_id nulo no banco).
  const callsByTrainerObj: Record<string, Call[]> = {}
  for (const [tid, tc] of callsByTrainer.entries()) {
    callsByTrainerObj[tid] = tc
  }

  return ok({
    trainers: outTrainers,
    bestCalls: outBest,
    worstCalls: outWorst,
    trainerBehavioral: outBehavioral,
    performanceTrends: performanceTrends as Record<string, PerformanceTrendPoint[]>,
    intentSignals,
    callsByTrainer: callsByTrainerObj,
    allCalls: calls,
  })
}
