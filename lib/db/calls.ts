import { createAdminClient } from '@/lib/supabase/admin'
import type { Call, CallResult } from '@/lib/types'

export interface GetCallsFilters {
  trainerId?: string
  result?: CallResult
  ownerId?: string
  limit?: number
  offset?: number
}

/**
 * Busca lista de calls do banco.
 * TODO: implementar query real quando tabela `calls` existir no Supabase.
 */
export async function dbGetCalls(filters?: GetCallsFilters): Promise<Call[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('calls')
    .select('*')
    .order('date', { ascending: false })

  if (filters?.trainerId) query = query.eq('trainer_id', filters.trainerId)
  if (filters?.result) query = query.eq('result', filters.result)
  if (filters?.ownerId) query = query.eq('owner_id', filters.ownerId)
  if (filters?.limit) query = query.limit(filters.limit)
  if (filters?.offset) query = query.range(filters.offset, (filters.offset + (filters.limit ?? 50)) - 1)

  const { data, error } = await query

  if (error) throw new Error(`dbGetCalls: ${error.message}`)

  // TODO: mapear snake_case do banco para camelCase da interface Call
  return (data ?? []) as unknown as Call[]
}

/**
 * Busca uma call por ID.
 * TODO: implementar quando tabela existir.
 */
export async function dbGetCallById(id: string): Promise<Call | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('calls')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // not found
    throw new Error(`dbGetCallById: ${error.message}`)
  }

  // TODO: mapear snake_case → camelCase
  return data as unknown as Call
}
