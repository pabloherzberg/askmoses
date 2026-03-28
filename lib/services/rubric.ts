import type { RubricSection, TrendPoint } from '@/lib/types'
import { rubricSections, trendData } from '@/lib/mock-data'

export async function getRubric(): Promise<{ sections: RubricSection[]; trend: TrendPoint[] }> {
  return { sections: rubricSections, trend: trendData }
}
