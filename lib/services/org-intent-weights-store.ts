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

/** Fetch the most recent intent weights from org_intent_weight_history table */
export async function getLatestOrgIntentWeightsFromDb(orgId: string): Promise<OrgIntentWeights | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('org_intent_weight_history')
    .select('financial, urgency, authority, engagement, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  return {
    orgId,
    financial: data.financial as number,
    urgency: data.urgency as number,
    authority: data.authority as number,
    engagement: data.engagement as number,
    updatedAt: data.created_at as string,
  }
}
