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
  orgId?: string
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
  orgId?: string
  rubricId?: string
  active?: boolean
}): Promise<DbScript[]> {
  const supabase = createAdminClient()

  // Active scripts surface first so the upload-page dropdown highlights the
  // one the org currently treats as default; archived ones still appear so
  // they can be re-used for re-analysis if needed.
  let query = supabase
    .from('scripts')
    .select('*')
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters?.orgId) query = query.eq('org_id', filters.orgId)
  if (filters?.rubricId) query = query.eq('rubric_id', filters.rubricId)
  if (filters?.active !== undefined) query = query.eq('is_active', filters.active)

  const { data, error } = await query

  if (error) throw new Error(`dbGetScripts: ${error.message}`)

  return (data ?? []) as DbScript[]
}

/**
 * Fetch a script by id. Pass `orgId` to enforce tenant isolation — required
 * defense-in-depth because dbCreateAdminClient bypasses RLS. Calling this
 * without `orgId` is a security bug; the parameter is required for that
 * reason (only internal scripts/seed code should ever opt-out by passing
 * an empty string explicitly).
 */
export async function dbGetScriptById(id: string, orgId: string): Promise<DbScript | null> {
  const supabase = createAdminClient()

  let query = supabase.from('scripts').select('*').eq('id', id)
  if (orgId) query = query.eq('org_id', orgId)

  const { data, error } = await query.maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetScriptById: ${error.message}`)
  }

  return (data ?? null) as DbScript | null
}

export async function dbCreateScript(input: CreateScriptInput): Promise<DbScript> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('scripts')
    .insert({
      org_id: input.orgId ?? null,
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
