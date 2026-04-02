import type { Client, GlobalMetrics } from '@/lib/types'

const IS_DEV = process.env.NODE_ENV === 'development'

export async function getClients(): Promise<{ clients: Client[]; metrics: GlobalMetrics }> {
  if (IS_DEV) {
    const { clients, globalMetrics } = await import('@/lib/mock-data')
    return { clients, metrics: globalMetrics }
  }

  const { dbGetClients, dbGetGlobalMetrics } = await import('@/lib/db/clients')
  const [clients, metrics] = await Promise.all([dbGetClients(), dbGetGlobalMetrics()])
  return { clients, metrics }
}
