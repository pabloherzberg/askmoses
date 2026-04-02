import type { Call, CallResult } from '@/lib/types'

const IS_DEV = process.env.NODE_ENV === 'development'

export interface GetCallsFilters {
  trainerId?: string
  result?: CallResult
}

export async function getCalls(filters?: GetCallsFilters): Promise<Call[]> {
  if (IS_DEV) {
    // Em dev o MSW intercepta o fetch no browser.
    // No server-side (API routes), usamos mock-data diretamente.
    const { calls } = await import('@/lib/mock-data')
    let data = [...calls]
    if (filters?.trainerId) data = data.filter((c) => c.trainerId === filters.trainerId)
    if (filters?.result) data = data.filter((c) => c.result === filters.result)
    return data
  }

  // Produção — query real no banco
  const { dbGetCalls } = await import('@/lib/db/calls')
  return dbGetCalls(filters)
}
  
export async function getCallById(id: string): Promise<Call | null> {
  if (IS_DEV) {
    const { calls } = await import('@/lib/mock-data')
    return calls.find((c) => c.id === id) ?? null
  }

  const { dbGetCallById } = await import('@/lib/db/calls')
  return dbGetCallById(id)
}
