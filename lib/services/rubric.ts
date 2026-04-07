import { dbGetActiveRubricWithCriteria } from '@/lib/db/rubric'
import { getCalls, avgRubricScores } from '@/lib/services/calls'
import type { RubricSection, RubricScores, TrendPoint } from '@/lib/types'

const CRITERION_KEY_MAP: Record<string, keyof RubricScores> = {
  'discovery': 'discovery',
  'problem agitation': 'problemAgitation',
  'offer presentation': 'offerPresentation',
  'objection handling': 'objectionHandling',
  'close & next steps': 'closeAndNextSteps',
  'close and next steps': 'closeAndNextSteps',
}

const SECTION_COLORS: RubricSection['color'][] = ['blue', 'accent2', 'green', 'amber', 'red']

export interface TrainerSectionScore {
  trainerId: string
  trainerName: string
  scores: Record<string, number> // criterionName → avg score 0–100
}

export async function getRubric(): Promise<{
  sections: RubricSection[]
  trend: TrendPoint[]
  trainerSectionScores: TrainerSectionScore[]
}> {
  const [result, calls] = await Promise.all([
    dbGetActiveRubricWithCriteria(),
    getCalls({ limit: 200 }),
  ])

  if (!result) return { sections: [], trend: [], trainerSectionScores: [] }

  // ── Team averages ─────────────────────────────────────────────────────────
  const teamAvg = avgRubricScores(calls) // 0–5 scale

  // ── Per-trainer averages ──────────────────────────────────────────────────
  const trainerCallsMap = new Map<string, typeof calls>()
  for (const call of calls) {
    if (!call.trainerId) continue
    if (!trainerCallsMap.has(call.trainerId)) trainerCallsMap.set(call.trainerId, [])
    trainerCallsMap.get(call.trainerId)!.push(call)
  }

  const trainerSectionScores: TrainerSectionScore[] = []
  for (const [trainerId, trainerCalls] of trainerCallsMap.entries()) {
    const avg = avgRubricScores(trainerCalls)
    const scores: Record<string, number> = {}
    for (const c of result.criteria) {
      const key = CRITERION_KEY_MAP[c.name.toLowerCase()]
      scores[c.name] = key ? Math.round(avg[key] * 20) : 0
    }
    trainerSectionScores.push({ trainerId, trainerName: trainerCalls[0].trainerName, scores })
  }

  // ── Sections ──────────────────────────────────────────────────────────────
  const sections: RubricSection[] = result.criteria.map((c, i) => {
    const key = CRITERION_KEY_MAP[c.name.toLowerCase()]
    return {
      id: (key ?? c.id) as RubricSection['id'],
      name: c.name,
      weight: 1,
      isCritical: false,
      description: c.description ?? '',
      teamAvg: key ? Math.round(teamAvg[key] * 20) : 0,
      color: SECTION_COLORS[i % SECTION_COLORS.length],
      trainerScores: { marcus: 0, jamie: 0, jordan: 0, taylor: 0 },
    }
  })

  return { sections, trend: [], trainerSectionScores }
}

export async function getRubricConfig() {
  return dbGetActiveRubricWithCriteria()
}
