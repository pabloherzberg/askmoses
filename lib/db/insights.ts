import { createAdminClient } from '@/lib/supabase/admin'
import type { Insight } from '@/lib/types'

/**
 * Busca insights gerados para um owner/período.
 * TODO: implementar query real quando tabela `insights` existir no Supabase.
 */
export async function dbGetInsights(filters?: {
  ownerId?: string
  limit?: number
}): Promise<Insight[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('insights')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters?.ownerId) query = query.eq('owner_id', filters.ownerId)
  if (filters?.limit) query = query.limit(filters.limit)

  const { data, error } = await query

  if (error) throw new Error(`dbGetInsights: ${error.message}`)

  // TODO: mapear snake_case → camelCase
  return (data ?? []) as unknown as Insight[]
}

/**
 * Salva insights gerados por IA no banco.
 * TODO: implementar quando fluxo de geração de insights real existir.
 */
export async function dbSaveInsights(
  insights: Omit<Insight, 'id'>[],
  ownerId: string
): Promise<void> {
  const supabase = createAdminClient()

  const rows = insights.map((i) => ({
    ...i,
    owner_id: ownerId,
    created_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from('insights').insert(rows)

  if (error) throw new Error(`dbSaveInsights: ${error.message}`)
}
