import type { RubricSection, TrendPoint } from '@/lib/types'

const USE_MOCK = process.env.USE_MOCK_DATA !== 'false'

export async function getRubric(): Promise<{ sections: RubricSection[]; trend: TrendPoint[] }> {
  if (USE_MOCK) {
    const { rubricSections, trendData } = await import('@/lib/mock-data')
    return { sections: rubricSections, trend: trendData }
  }

  const { dbGetActiveRubricWithCriteria } = await import('@/lib/db/rubric')
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
  if (USE_MOCK) {
    const { rubric } = await import('@/lib/mock-data')
    return rubric
  }
  const { dbGetActiveRubricWithCriteria } = await import('@/lib/db/rubric')
  return dbGetActiveRubricWithCriteria()
}
