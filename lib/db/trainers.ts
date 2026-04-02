import { createAdminClient } from '@/lib/supabase/admin'
import type { Trainer } from '@/lib/types'

export interface GetTrainersFilters {
  ownerId?: string
}

/**
 * Busca lista de trainers do banco.
 * TODO: implementar query real quando tabela `trainers` existir no Supabase.
 */
export async function dbGetTrainers(filters?: GetTrainersFilters): Promise<Trainer[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('trainers')
    .select('*')
    .order('name', { ascending: true })

  if (filters?.ownerId) query = query.eq('owner_id', filters.ownerId)

  const { data, error } = await query

  if (error) throw new Error(`dbGetTrainers: ${error.message}`)

  // TODO: mapear snake_case → camelCase e calcular stats derivados
  return (data ?? []) as unknown as Trainer[]
}

/**
 * Busca um trainer por ID.
 * TODO: implementar quando tabela existir.
 */
export async function dbGetTrainerById(id: string): Promise<Trainer | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('trainers')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetTrainerById: ${error.message}`)
  }

  // TODO: mapear snake_case → camelCase
  return data as unknown as Trainer
}
