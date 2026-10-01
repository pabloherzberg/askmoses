import { createAdminClient } from '@/lib/supabase/admin'

// Status do lead no GHL (migration 125). Won é definitivo: a RPC nunca rebaixa
// um lead won, só registra o que o GHL disse em ghl_status/ghl_divergence.

export type GhlLeadStatus = 'won' | 'lost' | 'open' | 'abandoned' | 'none'
export type GhlLeadSource = 'webhook' | 'sync' | 'backfill'

export interface ApplyGhlLeadStatusInput {
  orgId: string
  contactId: string
  /** O que o GHL diz HOJE (resolveLeadFromOpportunities). */
  ghlStatus: GhlLeadStatus
  wonAt: string | null
  opportunityId: string | null
  pipelineId: string | null
  stageId: string | null
  source: GhlLeadSource
  /** Só no backfill: grava trilha em calls_data_corrections e revisa o Stage 2. */
  appliedBy?: string | null
}

export interface ApplyGhlLeadStatusResult {
  status: GhlLeadStatus
  wonAt: string | null
  divergence: string | null
  callsUpdated: number
  stage2Removed: number
  stage2Marked: string | null
}

export async function dbApplyGhlLeadStatus(input: ApplyGhlLeadStatusInput): Promise<ApplyGhlLeadStatusResult> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('apply_ghl_lead_status', {
    p_org_id: input.orgId,
    p_contact_id: input.contactId,
    p_ghl_status: input.ghlStatus,
    p_won_at: input.wonAt,
    p_opportunity_id: input.opportunityId,
    p_pipeline_id: input.pipelineId,
    p_stage_id: input.stageId,
    p_source: input.source,
    p_applied_by: input.appliedBy ?? null,
  })
  if (error) throw new Error(`dbApplyGhlLeadStatus: ${error.message}`)

  const row = (Array.isArray(data) ? data[0] : data) as {
    status: GhlLeadStatus
    won_at: string | null
    divergence: string | null
    calls_updated: number
    stage2_removed: number
    stage2_marked: string | null
  } | undefined
  if (!row) throw new Error('dbApplyGhlLeadStatus: RPC não devolveu linha')

  return {
    status: row.status,
    wonAt: row.won_at,
    divergence: row.divergence,
    callsUpdated: Number(row.calls_updated) || 0,
    stage2Removed: Number(row.stage2_removed) || 0,
    stage2Marked: row.stage2_marked,
  }
}

// Contatos da org (com pelo menos uma call) que ainda não são Won, os
// consultados há mais tempo primeiro.
export async function dbListLeadsToRevisit(orgId: string, limit: number): Promise<string[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('ghl_leads_to_revisit', { p_org_id: orgId, p_limit: limit })
  if (error) throw new Error(`dbListLeadsToRevisit: ${error.message}`)
  return ((data ?? []) as Array<{ contact_id: string }>).map((r) => r.contact_id)
}

// Call que o webhook recusou sem criar linha em calls. O GHL reenvia o mesmo
// evento; a unique (org, external_call_id, reason) faz o reenvio contar uma vez.
export async function dbRecordRejectedCall(input: {
  orgId: string
  contactId: string | null
  externalCallId: string
  reason: string
}): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('ghl_rejected_calls').upsert(
    {
      org_id: input.orgId,
      contact_id: input.contactId,
      external_call_id: input.externalCallId,
      reason: input.reason,
    },
    { onConflict: 'org_id,external_call_id,reason', ignoreDuplicates: true },
  )
  if (error) throw new Error(`dbRecordRejectedCall: ${error.message}`)
}
