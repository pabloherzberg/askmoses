import { createAdminClient } from '@/lib/supabase/admin'
import type { RubricSection, TrendPoint } from '@/lib/types'

/**
 * Busca as seções da rubrica ativa.
 * TODO: implementar query real quando tabela `rubric_sections` existir.
 */
export async function dbGetRubricSections(): Promise<RubricSection[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('rubric_sections')
    .select('*')
    .eq('is_active', true)
    .order('weight', { ascending: false })

  if (error) throw new Error(`dbGetRubricSections: ${error.message}`)

  // TODO: mapear colunas do banco para interface RubricSection
  return (data ?? []) as unknown as RubricSection[]
}

/**
 * Busca dados de tendência (close rate + score por semana).
 * TODO: implementar com query de agregação temporal no Supabase.
 */
export async function dbGetTrendData(weeks = 6): Promise<TrendPoint[]> {
  const supabase = createAdminClient()

  // TODO: substituir por supabase.rpc('get_trend_data', { weeks })
  // ou query com date_trunc sobre tabela de calls
  const { data, error } = await supabase
    .from('trend_data')
    .select('week, close_rate, score')
    .order('week', { ascending: true })
    .limit(weeks)

  if (error) throw new Error(`dbGetTrendData: ${error.message}`)

  // TODO: mapear snake_case → camelCase
  return (data ?? []) as unknown as TrendPoint[]
}

/**
 * Busca configuração completa da rubrica (para settings).
 * TODO: implementar quando tabela `rubrics` existir.
 */
export async function dbGetRubricConfig() {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('rubrics')
    .select('*, scripts(*)')
    .eq('is_active', true)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetRubricConfig: ${error.message}`)
  }

  return data
}
