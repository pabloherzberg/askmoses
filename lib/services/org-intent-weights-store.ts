// In-memory storage for org intent weights during Fase 1 (mock)
// Format: { orgId: { financial: 4, urgency: 3, authority: 2, engagement: 1, updatedAt: ISO } }
import { createAdminClient } from '@/lib/supabase/admin'
import type { OrgIntentWeights } from '@/lib/types'
import { DEFAULT_INTENT_WEIGHTS } from '@/lib/constants/intent'

const orgIntentWeights: Map<string, OrgIntentWeights> = new Map()

export function getOrgIntentWeightsFromStore(orgId: string): OrgIntentWeights {
  const stored = orgIntentWeights.get(orgId)
  if (stored) return stored

  // Return defaults if not customized
  return {
    orgId,
    ...DEFAULT_INTENT_WEIGHTS,
    updatedAt: new Date().toISOString(),
  }
}

export function setOrgIntentWeightsInStore(orgId: string, weights: OrgIntentWeights): void {
  orgIntentWeights.set(orgId, weights)
}

export function getOrgIntentWeightsStore(): Map<string, OrgIntentWeights> {
  return orgIntentWeights
}

/** Fetch the most recent intent weights from org_intent_weight_history table.
 *  Os pesos ficam no JSONB `new_weights` (não em colunas escalares). */
export async function getLatestOrgIntentWeightsFromDb(orgId: string): Promise<OrgIntentWeights | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('org_intent_weight_history')
    .select('new_weights, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.new_weights) return null

  const w = data.new_weights as Record<string, number>
  return {
    orgId,
    financial: w.financial ?? DEFAULT_INTENT_WEIGHTS.financial,
    urgency: w.urgency ?? DEFAULT_INTENT_WEIGHTS.urgency,
    authority: w.authority ?? DEFAULT_INTENT_WEIGHTS.authority,
    engagement: w.engagement ?? DEFAULT_INTENT_WEIGHTS.engagement,
    updatedAt: data.created_at as string,
  }
}
