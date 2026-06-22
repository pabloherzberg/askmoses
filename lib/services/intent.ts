import { DEFAULT_INTENT_WEIGHTS } from '@/lib/constants/intent'
import type { IntentSignal, IntentBreakdown, OrgIntentWeights } from '@/lib/types'

// Fetch intent signals via API (MSW intercepts in dev, real API in production)
export async function getIntentSignals(): Promise<IntentSignal[]> {
  try {
    const response = await fetch('/api/intent-signals')
    const data = await response.json()
    return data?.data?.signals || []
  } catch {
    // Fallback: return default signal structure (should not happen in normal operation)
    return [
      { id: 'financial', weight: 4, color: 'amber' },
      { id: 'urgency', weight: 3, color: 'red' },
      { id: 'authority', weight: 2, color: 'blue' },
      { id: 'engagement', weight: 1, color: 'accent2' },
    ]
  }
}

export async function updateIntentWeights(weights: Record<string, number>): Promise<IntentSignal[]> {
  const response = await fetch('/api/intent', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weights }),
  })
  const data = await response.json()
  return data.signals || []
}

// Fallback derivation when IA scores unavailable. Returns neutral average (5 per signal).
// Deterministic: same call always produces same breakdown. Used only when intent_breakdown
// from IA is absent (e.g., older calls before Phase 3, or during fallback).
export function deriveIntentBreakdownForCall(
  callScore: number,
  signals: IntentSignal[],
): IntentBreakdown {
  return {
    financial: 5,
    urgency: 5,
    authority: 5,
    engagement: 5,
  }
}

export function getOrgIntentAverage(breakdowns: IntentBreakdown[]): IntentBreakdown {
  if (breakdowns.length === 0) {
    return { financial: 5, urgency: 5, authority: 5, engagement: 5 }
  }
  return {
    financial: breakdowns.reduce((sum, b) => sum + b.financial, 0) / breakdowns.length,
    urgency: breakdowns.reduce((sum, b) => sum + b.urgency, 0) / breakdowns.length,
    authority: breakdowns.reduce((sum, b) => sum + b.authority, 0) / breakdowns.length,
    engagement: breakdowns.reduce((sum, b) => sum + b.engagement, 0) / breakdowns.length,
  }
}

// Server-safe version (returns defaults, no fetch)
export function getDefaultOrgIntentWeights(orgId: string): OrgIntentWeights {
  return {
    orgId,
    ...DEFAULT_INTENT_WEIGHTS,
    updatedAt: new Date().toISOString(),
  }
}

// Client-side version (uses fetch)
export async function getOrgIntentWeights(orgId: string): Promise<OrgIntentWeights> {
  try {
    const response = await fetch(`/api/admin/intent-weights?orgId=${orgId}`)
    const result = await response.json()
    // ok() wrapper returns { data: { weights: {...} }, error: null }
    return result?.data?.weights || getDefaultOrgIntentWeights(orgId)
  } catch {
    return getDefaultOrgIntentWeights(orgId)
  }
}

export async function updateOrgIntentWeights(
  orgId: string,
  weights: Partial<OrgIntentWeights>,
): Promise<OrgIntentWeights | null> {
  const response = await fetch('/api/admin/intent-weights', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgId, ...weights }),
  })
  const result = await response.json()
  // ok() wrapper returns { data: { weights: {...} }, error: null }
  return result?.data?.weights || null
}

// Extract weight values only (omit orgId, updatedAt) for history audit table
function serializeIntentWeights(weights: OrgIntentWeights): Record<string, number> {
  return {
    financial: weights.financial,
    urgency: weights.urgency,
    authority: weights.authority,
    engagement: weights.engagement,
  }
}

// Server-side helper para registrar mudanças de peso no histórico
// Chamado pelo endpoint PATCH /api/admin/intent-weights
export async function recordIntentWeightChange(
  orgId: string,
  oldWeights: OrgIntentWeights | null,
  newWeights: OrgIntentWeights,
  changedBy: string | null,
  reason?: string,
): Promise<void> {
  try {
    const admin = await import('@/lib/supabase/admin').then((m) => m.createAdminClient())
    await admin.from('org_intent_weight_history').insert({
      org_id: orgId,
      old_weights: oldWeights ? serializeIntentWeights(oldWeights) : null,
      new_weights: serializeIntentWeights(newWeights),
      changed_by: changedBy || null,
      reason: reason || null,
    })
  } catch (err) {
    console.warn('[intent] Failed to record weight change in history:', err)
    // Não quebra o fluxo se o histórico falhar
  }
}

// Server-side function to retrieve org weights for scoring.
// Used during intent calculation to respect org-specific weight preferences.
// Loads from database history (most recent entry for the org).
// Falls back to defaults if not found.
export async function getOrgIntentWeightsForScoring(
  orgId: string,
): Promise<{ financial: number; urgency: number; authority: number; engagement: number }> {
  try {
    const admin = await import('@/lib/supabase/admin').then((m) => m.createAdminClient())
    const { data, error } = await admin
      .from('org_intent_weight_history')
      .select('new_weights')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data?.new_weights) {
      return DEFAULT_INTENT_WEIGHTS
    }

    const weights = data.new_weights as Record<string, number>
    return {
      financial: weights.financial ?? DEFAULT_INTENT_WEIGHTS.financial,
      urgency: weights.urgency ?? DEFAULT_INTENT_WEIGHTS.urgency,
      authority: weights.authority ?? DEFAULT_INTENT_WEIGHTS.authority,
      engagement: weights.engagement ?? DEFAULT_INTENT_WEIGHTS.engagement,
    }
  } catch {
    return DEFAULT_INTENT_WEIGHTS
  }
}
