import { createAdminClient } from '@/lib/supabase/admin'

export interface DbRubric {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  system_prompt: string | null
  llm_model: string | null
}

export interface DbCriterion {
  id: string
  rubric_id: string
  name: string
  description: string | null
  sort_order: number
  created_at: string
}

export async function dbGetActiveRubric(): Promise<DbRubric | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('rubrics')
    .select('*')
    .eq('is_active', true)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetActiveRubric: ${error.message}`)
  }

  return data as DbRubric
}

export async function dbGetRubrics(): Promise<DbRubric[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('rubrics')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`dbGetRubrics: ${error.message}`)

  return (data ?? []) as DbRubric[]
}

export async function dbGetCriteriaByRubric(rubricId: string): Promise<DbCriterion[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('criteria')
    .select('*')
    .eq('rubric_id', rubricId)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`dbGetCriteriaByRubric: ${error.message}`)

  return (data ?? []) as DbCriterion[]
}

export async function dbGetActiveRubricWithCriteria(): Promise<{
  rubric: DbRubric
  criteria: DbCriterion[]
} | null> {
  const rubric = await dbGetActiveRubric()
  if (!rubric) return null

  const criteria = await dbGetCriteriaByRubric(rubric.id)
  return { rubric, criteria }
}

/** @deprecated use dbGetActiveRubricWithCriteria */
export async function dbGetRubricConfig() {
  return dbGetActiveRubricWithCriteria()
}

/** @deprecated use dbGetActiveRubric */
export async function dbGetRubricSections(): Promise<DbCriterion[]> {
  const rubric = await dbGetActiveRubric()
  if (!rubric) return []
  return dbGetCriteriaByRubric(rubric.id)
}

/** @deprecated not applicable to current schema */
export async function dbGetTrendData(_weeks = 6) {
  return []
}
