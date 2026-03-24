import { clients, globalMetrics } from '@/lib/mock-data'

export async function getClients() {
  return clients
}

export async function getGlobalMetrics() {
  return globalMetrics
}
