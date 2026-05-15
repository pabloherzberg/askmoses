import { createAdminClient } from '@/lib/supabase/admin'

export interface DbMarketingCopyItem {
  id: string
  text: string
  confidence: number
  basis: string
}

export interface DbMarketingRun {
  id: string
  org_id: string
  ran_at: string
  sample_call_ids: string[]
  headlines: DbMarketingCopyItem[]
  primary_texts: DbMarketingCopyItem[]
  model_used: string | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
  created_by: string | null
  trigger: 'auto' | 'manual'
}

export interface CreateMarketingRunInput {
  orgId: string
  sampleCallIds: string[]
  headlines: DbMarketingCopyItem[]
  primaryTexts: DbMarketingCopyItem[]
  modelUsed?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  costUsd?: number | null
  createdBy?: string | null
  trigger: 'auto' | 'manual'
}

export async function dbGetLatestMarketingRun(orgId: string): Promise<DbMarketingRun | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('marketing_runs')
    .select('*')
    .eq('org_id', orgId)
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetLatestMarketingRun: ${error.message}`)
  }
  return (data ?? null) as DbMarketingRun | null
}

export async function dbInsertMarketingRun(input: CreateMarketingRunInput): Promise<DbMarketingRun> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('marketing_runs')
    .insert({
      org_id: input.orgId,
      sample_call_ids: input.sampleCallIds,
      headlines: input.headlines,
      primary_texts: input.primaryTexts,
      model_used: input.modelUsed ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      cost_usd: input.costUsd ?? null,
      created_by: input.createdBy ?? null,
      trigger: input.trigger,
    })
    .select()
    .single()

  if (error) throw new Error(`dbInsertMarketingRun: ${error.message}`)
  return data as DbMarketingRun
}
