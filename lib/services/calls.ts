import type { Call, CallResult } from '@/lib/types'
import { calls } from '@/lib/mock-data'

export async function getCalls(filters?: {
  trainerId?: string
  result?: CallResult
}): Promise<Call[]> {
  let data = [...calls]
  if (filters?.trainerId) data = data.filter((c) => c.trainerId === filters.trainerId)
  if (filters?.result) data = data.filter((c) => c.result === filters.result)
  return data
}

export async function getCallById(id: string): Promise<Call | null> {
  return calls.find((c) => c.id === id) ?? null
}
