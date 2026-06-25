import { type NextRequest } from 'next/server'
import { ok, unauthorized, getSession, getActiveOrgContext } from '@/lib/auth'
import { getStageConfig, updateStageConfig } from '@/lib/services/stage-config'
import type { CallResult } from '@/lib/types'

const VALID_OUTCOMES: CallResult[] = ['closed', 'not_closed', 'partial', 'no_outcome']

// Config dos dois estágios (Stage 1 / Stage 2) por org — owner-scoped.
// Opera sempre na org ativa do solicitante (owner ou admin impersonando).
export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const ctx = await getActiveOrgContext()
  const orgId = ctx?.activeOrgId
  if (!orgId || (ctx?.role !== 'owner' && ctx?.role !== 'admin')) {
    return ok({ error: 'Not authorized for this org', config: null })
  }

  const config = await getStageConfig(orgId)
  return ok({ config })
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
    const patch: { stage1SuccessOutcomes?: CallResult[]; stage2SuccessLabel?: string | null } = {}

    if (Array.isArray(body.stage1SuccessOutcomes)) {
      const filtered = (body.stage1SuccessOutcomes as string[]).filter((o): o is CallResult =>
        VALID_OUTCOMES.includes(o as CallResult),
      )
      if (filtered.length === 0) {
        return ok({ error: 'stage1SuccessOutcomes must include at least one valid outcome' })
      }
      patch.stage1SuccessOutcomes = filtered
    }

    if (typeof body.stage2SuccessLabel === 'string' || body.stage2SuccessLabel === null) {
      patch.stage2SuccessLabel = body.stage2SuccessLabel
    }

    const config = await updateStageConfig(orgId, patch)
    if (!config) return ok({ error: 'Failed to update stage config' })
    return ok({ config })
  } catch {
    return ok({ error: 'Failed to update stage config' })
  }
}
