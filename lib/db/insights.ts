import { createAdminClient } from '@/lib/supabase/admin'
import type { Insight } from '@/lib/types'

interface DbInsight {
  id: string
  type: string
  icon: string
  title: string
  tag: string
  tag_color: string
  summary: string
  action: string
}

function toInsight(db: DbInsight): Insight {
  return {
    id: db.id,
    type: db.type as Insight['type'],
    icon: db.icon,
    title: db.title,
    tag: db.tag,
    tagColor: db.tag_color as Insight['tagColor'],
    summary: db.summary,
    action: db.action,
  }
}

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

  // Tabela ainda não existe no banco — retorna vazio em vez de quebrar
  if (error?.code === 'PGRST200' || error?.message?.includes('schema cache')) return []
  if (error) throw new Error(`dbGetInsights: ${error.message}`)

  return (data ?? []).map((row) => toInsight(row as DbInsight))
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
