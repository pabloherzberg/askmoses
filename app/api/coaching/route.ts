import { type NextRequest } from 'next/server'
import { ok, unauthorized, getSession, getOrgId } from '@/lib/auth'
import { dbGetTrainers } from '@/lib/db/trainers'
import { getCalls } from '@/lib/services/calls'
import { getPerformanceTrends } from '@/lib/services/trainers'
import { buildBehavioralProfile, buildBestWorstCalls } from '@/lib/services/coaching'
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

  const [calls, performanceTrends] = await Promise.all([
    getCalls({ orgId, limit: 200, locale }),
    getPerformanceTrends(trainers),
  ])

  // Calls agrupadas por trainer.
  const callsByTrainer = new Map<string, Call[]>()
  for (const c of calls) {
    if (!c.trainerId) continue
    const list = callsByTrainer.get(c.trainerId)
    if (list) list.push(c)
    else callsByTrainer.set(c.trainerId, [c])
  }

  const weekStart = startOfWeek(new Date())

  const outTrainers: Trainer[] = []
  const outBehavioral: Record<string, BehavioralDimension[]> = {}
  const outBest: CallsByTrainerMap = {}
  const outWorst: CallsByTrainerMap = {}

  for (const trainer of trainers) {
    const tc = callsByTrainer.get(trainer.id) ?? []
    const callsThisWeek = tc.filter(
      (c) => new Date(c.date).getTime() >= weekStart,
    ).length

    // trainer.totalCalls vem do cache em `trainers.total_calls` (atualizado
    // por syncTrainerStats). Se o cache estiver stale (calls inseridas direto
    // no banco, sem passar por /api/analyze — ex.: seeds), tc.length é a
    // verdade do momento: usamos o maior pra a UI nunca dizer "sem calls"
    // enquanto a tabela `calls` mostra calls de fato.
    const totalCalls = Math.max(trainer.totalCalls ?? 0, tc.length)
    outTrainers.push({ ...trainer, totalCalls, callsThisWeek })
    outBehavioral[trainer.id] = buildBehavioralProfile(trainer, trainers)
    const { best, worst } = buildBestWorstCalls(tc)
    outBest[trainer.id] = best
    outWorst[trainer.id] = worst
  }

  return ok({
    trainers: outTrainers,
    bestCalls: outBest,
    worstCalls: outWorst,
    trainerBehavioral: outBehavioral,
    performanceTrends: performanceTrends as Record<string, PerformanceTrendPoint[]>,
  })
}
