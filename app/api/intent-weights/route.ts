import { type NextRequest } from 'next/server'
import { ok, unauthorized, getSession, getActiveOrgContext } from '@/lib/auth'
import { recordIntentWeightChange } from '@/lib/services/intent'
import { DEFAULT_INTENT_WEIGHTS, validateIntentWeights } from '@/lib/constants/intent'
import {
  getOrgIntentWeightsFromStore,
  setOrgIntentWeightsInStore,
  getLatestOrgIntentWeightsFromDb,
} from '@/lib/services/org-intent-weights-store'
import type { OrgIntentWeights } from '@/lib/types'

// Endpoint owner-scoped: opera SEMPRE na org ativa do solicitante (owner ou
// admin impersonando). Diferente do /api/admin/intent-weights (admin escolhe
// qualquer org via querystring), aqui a org vem do contexto — owner configura
// só a própria org. Espelha a matriz do rubric config (owner+admin).

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const ctx = await getActiveOrgContext()
  const orgId = ctx?.activeOrgId
  if (!orgId || (ctx?.role !== 'owner' && ctx?.role !== 'admin')) {
    return ok({ error: 'Not authorized for this org', weights: null })
  }

  const dbWeights = await getLatestOrgIntentWeightsFromDb(orgId)
  const weights = dbWeights || getOrgIntentWeightsFromStore(orgId)
  return ok({ weights })
}

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const ctx = await getActiveOrgContext()
  const orgId = ctx?.activeOrgId
  if (!orgId || (ctx?.role !== 'owner' && ctx?.role !== 'admin')) {
    return ok({ error: 'Not authorized for this org' })
  }

  try {
    const body = await request.json()
    const { financial, urgency, authority, engagement } = body

    const newWeights: OrgIntentWeights = {
      orgId,
      financial: Math.floor(financial) || DEFAULT_INTENT_WEIGHTS.financial,
      urgency: Math.floor(urgency) || DEFAULT_INTENT_WEIGHTS.urgency,
      authority: Math.floor(authority) || DEFAULT_INTENT_WEIGHTS.authority,
      engagement: Math.floor(engagement) || DEFAULT_INTENT_WEIGHTS.engagement,
      updatedAt: new Date().toISOString(),
    }

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

    const oldWeights = (await getLatestOrgIntentWeightsFromDb(orgId)) || getOrgIntentWeightsFromStore(orgId) || null
    setOrgIntentWeightsInStore(orgId, newWeights)
    await recordIntentWeightChange(orgId, oldWeights, newWeights, session.user.id)

    return ok({ weights: newWeights })
  } catch {
    return ok({ error: 'Failed to update weights' })
  }
}
