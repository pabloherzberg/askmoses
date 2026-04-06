import { dbGetActiveRubricWithCriteria } from '@/lib/db/rubric'
import type { RubricSection, TrendPoint } from '@/lib/types'

export async function getRubric(): Promise<{ sections: RubricSection[]; trend: TrendPoint[] }> {
  const result = await dbGetActiveRubricWithCriteria()
  if (!result) return { sections: [], trend: [] }

  const sections: RubricSection[] = result.criteria.map((c) => ({
    id: c.id as RubricSection['id'],
    name: c.name,
    weight: 1,
    isCritical: false,
    description: c.description ?? '',
    teamAvg: 0,
    color: 'blue' as RubricSection['color'],
    trainerScores: { marcus: 0, jamie: 0, jordan: 0, taylor: 0 },
  }))

  return { sections, trend: [] }
}

export async function getRubricConfig() {
  return dbGetActiveRubricWithCriteria()
}
