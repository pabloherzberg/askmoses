import { createAdminClient } from '@/lib/supabase/admin'

export interface ScriptSection {
  name: string
  instructions: string
  tips: string
}

export interface ScriptCriterion {
  name: string
  description: string
}

export interface DbScript {
  id: string
  rubric_id: string
  name: string
  description: string | null
  sections: ScriptSection[]
  full_script: string | null
  criteria: ScriptCriterion[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateScriptInput {
  rubricId: string
  name: string
  description?: string
  sections: ScriptSection[]
  full_script?: string
  criteria: ScriptCriterion[]
  isActive?: boolean
}

export interface UpdateScriptInput {
  name?: string
  description?: string
  sections?: ScriptSection[]
  full_script?: string
  criteria?: ScriptCriterion[]
  isActive?: boolean
}

export async function dbGetScripts(filters?: {
  rubricId?: string
  active?: boolean
}): Promise<DbScript[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('scripts')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters?.rubricId) query = query.eq('rubric_id', filters.rubricId)
  if (filters?.active !== undefined) query = query.eq('is_active', filters.active)

  const { data, error } = await query

  if (error) throw new Error(`dbGetScripts: ${error.message}`)

  return (data ?? []) as DbScript[]
}

export async function dbCreateScript(input: CreateScriptInput): Promise<DbScript> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('scripts')
    .insert({
      rubric_id: input.rubricId,
      name: input.name,
      description: input.description ?? null,
      sections: input.sections,
      full_script: input.full_script ?? null,
      criteria: input.criteria,
      is_active: input.isActive ?? true,
    })
    .select()
    .single()

  if (error) throw new Error(`dbCreateScript: ${error.message}`)

  return data as DbScript
}

export async function dbUpdateScript(id: string, input: UpdateScriptInput): Promise<DbScript> {
  const supabase = createAdminClient()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.sections !== undefined) patch.sections = input.sections
  if (input.full_script !== undefined) patch.full_script = input.full_script
  if (input.criteria !== undefined) patch.criteria = input.criteria
  if (input.isActive !== undefined) patch.is_active = input.isActive

  const { data, error } = await supabase
    .from('scripts')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`dbUpdateScript: ${error.message}`)

  return data as DbScript
}

export async function dbDeleteScript(id: string): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('scripts')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`dbDeleteScript: ${error.message}`)
}
