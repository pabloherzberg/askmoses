import type { Insight } from '@/lib/types'

const IS_DEV = process.env.NODE_ENV === 'development'

export async function getInsights(): Promise<Insight[]> {
  if (IS_DEV) {
    const { insights } = await import('@/lib/mock-data')
    return insights
  }

  const { dbGetInsights } = await import('@/lib/db/insights')
  return dbGetInsights()
}
