import type { RubricSection, TrendPoint } from '@/lib/types'

export async function getRubric(): Promise<{ sections: RubricSection[]; trend: TrendPoint[] }> {
  const { dbGetActiveRubricWithCriteria } = await import('@/lib/db/rubric')
  const result = await dbGetActiveRubricWithCriteria()
  if (!result) return { sections: [], trend: [] }

  const colors: RubricSection['color'][] = ['blue', 'accent2', 'green', 'amber', 'red']
  const sections: RubricSection[] = result.criteria.map((c, i) => ({
    id: c.id as RubricSection['id'],
    name: c.name,
    weight: 1,
    isCritical: false,
    description: c.description ?? '',
    teamAvg: 0,
    color: colors[i % colors.length],
    trainerScores: { marcus: 0, jamie: 0, jordan: 0, taylor: 0 },
  }))

  return { sections, trend: [] }
}

export async function getRubricConfig() {
  const { dbGetActiveRubricWithCriteria } = await import('@/lib/db/rubric')
  return dbGetActiveRubricWithCriteria()
}
