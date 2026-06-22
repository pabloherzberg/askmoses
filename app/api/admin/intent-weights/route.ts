import { type NextRequest } from 'next/server'
import { ok, unauthorized, getSession, getRole } from '@/lib/auth'
import { recordIntentWeightChange } from '@/lib/services/intent'
import { DEFAULT_INTENT_WEIGHTS, INTENT_WEIGHT_CONSTRAINTS, validateIntentWeights } from '@/lib/constants/intent'
import {
  getOrgIntentWeightsFromStore,
  setOrgIntentWeightsInStore,
  getOrgIntentWeightsStore,
  getLatestOrgIntentWeightsFromDb,
} from '@/lib/services/org-intent-weights-store'
import type { OrgIntentWeights } from '@/lib/types'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role !== 'admin') return ok({ error: 'Only admins can view intent weights', weights: null })

  const orgId = request.nextUrl.searchParams.get('orgId')
  if (!orgId) return ok({ error: 'Missing orgId parameter', weights: null })

  // Try to fetch the most recent weights from DB (org_intent_weight_history)
  const dbWeights = await getLatestOrgIntentWeightsFromDb(orgId)
  const weights = dbWeights || getOrgIntentWeightsFromStore(orgId)

  return ok({ weights })
}

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role !== 'admin') return ok({ error: 'Only admins can update intent weights' })

  try {
    const body = await request.json()
    const { orgId, financial, urgency, authority, engagement } = body

    if (!orgId) return ok({ error: 'Missing orgId' })

    const newWeights: OrgIntentWeights = {
      orgId,
      financial: Math.floor(financial) || DEFAULT_INTENT_WEIGHTS.financial,
      urgency: Math.floor(urgency) || DEFAULT_INTENT_WEIGHTS.urgency,
      authority: Math.floor(authority) || DEFAULT_INTENT_WEIGHTS.authority,
      engagement: Math.floor(engagement) || DEFAULT_INTENT_WEIGHTS.engagement,
      updatedAt: new Date().toISOString(),
    }

    // Validar pesos
    const validation = validateIntentWeights({
      financial: newWeights.financial,
      urgency: newWeights.urgency,
      authority: newWeights.authority,
      engagement: newWeights.engagement,
    })

    if (!validation.valid) {
      return ok({
        error: validation.error,
        weights: getOrgIntentWeightsFromStore(orgId),
      })
    }

    const oldWeights = getOrgIntentWeightsFromStore(orgId) || null
    setOrgIntentWeightsInStore(orgId, newWeights)

    // Record change in history (best-effort, não quebra se falhar)
    const session = await getSession()
    const userId = session?.user?.id || null
    await recordIntentWeightChange(orgId, oldWeights, newWeights, userId)

    return ok({ weights: newWeights })
  } catch {
    return ok({ error: 'Failed to update weights' })
  }
}
