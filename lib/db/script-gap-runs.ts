import { createAdminClient } from '@/lib/supabase/admin'

export interface DbScriptGapRun {
  id: string
  org_id: string
  ran_at: string
  call_ids: string[]
  gap_count: number
  model_used: string | null
  created_by: string | null
  trigger: 'auto' | 'manual'
}

export interface CreateScriptGapRunInput {
  orgId: string
  callIds: string[]
  gapCount: number
  modelUsed?: string | null
  createdBy?: string | null
  trigger: 'auto' | 'manual'
}

export async function dbGetLatestScriptGapRun(orgId: string): Promise<DbScriptGapRun | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('script_gap_runs')
    .select('*')
    .eq('org_id', orgId)
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetLatestScriptGapRun: ${error.message}`)
  }
  return (data ?? null) as DbScriptGapRun | null
}

export async function dbInsertScriptGapRun(input: CreateScriptGapRunInput): Promise<DbScriptGapRun> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('script_gap_runs')
    .insert({
      org_id: input.orgId,
      call_ids: input.callIds,
      gap_count: input.gapCount,
      model_used: input.modelUsed ?? null,
      created_by: input.createdBy ?? null,
      trigger: input.trigger,
    })
    .select()
    .single()

  if (error) throw new Error(`dbInsertScriptGapRun: ${error.message}`)
  return data as DbScriptGapRun
}
