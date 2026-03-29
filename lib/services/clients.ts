import type { Client, GlobalMetrics } from '@/lib/types'
import { clients, globalMetrics } from '@/lib/mock-data'

export async function getClients(): Promise<{ clients: Client[]; metrics: GlobalMetrics }> {
  return { clients, metrics: globalMetrics }
}
