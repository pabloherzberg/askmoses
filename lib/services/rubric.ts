import type { RubricSection, TrendPoint } from '@/lib/types'

const IS_DEV = process.env.NODE_ENV === 'development'

export async function getRubric(): Promise<{ sections: RubricSection[]; trend: TrendPoint[] }> {
  if (IS_DEV) {
    const { rubricSections, trendData } = await import('@/lib/mock-data')
    return { sections: rubricSections, trend: trendData }
  }

  const { dbGetRubricSections, dbGetTrendData } = await import('@/lib/db/rubric')
  const [sections, trend] = await Promise.all([dbGetRubricSections(), dbGetTrendData()])
  return { sections, trend }
}

export async function getRubricConfig() {
  if (IS_DEV) {
    const { rubric } = await import('@/lib/mock-data')
    return rubric
  }

  const { dbGetRubricConfig } = await import('@/lib/db/rubric')
  return dbGetRubricConfig()
}
