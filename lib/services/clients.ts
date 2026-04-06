import type { Client, GlobalMetrics } from '@/lib/types'

const USE_MOCK = process.env.USE_MOCK_DATA !== 'false'

export async function getClients(): Promise<{ clients: Client[]; metrics: GlobalMetrics }> {
  if (USE_MOCK) {
    const { clients, globalMetrics } = await import('@/lib/mock-data')
    return { clients, metrics: globalMetrics }
  }

  const { dbGetClients, dbGetGlobalMetrics } = await import('@/lib/db/clients')
  const [clients, metrics] = await Promise.all([dbGetClients(), dbGetGlobalMetrics()])
  return { clients, metrics }
}
