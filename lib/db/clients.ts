import { createAdminClient } from '@/lib/supabase/admin'
import type { Client, GlobalMetrics } from '@/lib/types'

/**
 * Busca lista de clientes (organizações) do banco.
 * TODO: implementar query real quando tabela `clients` existir no Supabase.
 */
export async function dbGetClients(): Promise<Client[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw new Error(`dbGetClients: ${error.message}`)

  // TODO: mapear snake_case → camelCase
  return (data ?? []) as unknown as Client[]
}

/**
 * Calcula métricas globais (MRR, total calls, avg score).
 * TODO: implementar com aggregation query ou view materializada no Supabase.
 */
export async function dbGetGlobalMetrics(): Promise<GlobalMetrics> {
  const supabase = createAdminClient()

  // TODO: substituir por query de aggregação real
  // Exemplo: supabase.rpc('get_global_metrics')
  const { data, error } = await supabase
    .from('clients')
    .select('mrr, calls_this_month, avg_score')

  if (error) throw new Error(`dbGetGlobalMetrics: ${error.message}`)

  const rows = data ?? []
  return {
    totalClients: rows.length,
    totalCallsThisMonth: rows.reduce((s: number, r: Record<string, number>) => s + (r.calls_this_month ?? 0), 0),
    totalMRR: rows.reduce((s: number, r: Record<string, number>) => s + (r.mrr ?? 0), 0),
    avgScore: rows.length
      ? Math.round(rows.reduce((s: number, r: Record<string, number>) => s + (r.avg_score ?? 0), 0) / rows.length)
      : 0,
  }
}
