import type { Insight } from '@/lib/types'
import { insights } from '@/lib/mock-data'

export async function getInsights(): Promise<Insight[]> {
  return insights
}
