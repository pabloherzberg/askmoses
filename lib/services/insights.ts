import type { Insight } from '@/lib/types'

const USE_MOCK = process.env.USE_MOCK_DATA !== 'false'

export async function getInsights(): Promise<Insight[]> {
  if (USE_MOCK) {
    const { insights } = await import('@/lib/mock-data')
    return insights
  }

  const { dbGetInsights } = await import('@/lib/db/insights')
  return dbGetInsights()
}
