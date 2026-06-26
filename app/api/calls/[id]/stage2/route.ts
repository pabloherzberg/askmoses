import { type NextRequest } from 'next/server'
import { ok, unauthorized, forbidden, notFound } from '@/lib/auth'
import { getSession, getRole, getOrgId, requireOwnerWrite } from '@/lib/auth'
import { getCallById } from '@/lib/services/calls'
import { dbMarkStage2 } from '@/lib/db/calls'
import { computeIntentIndex, resolveIntentWeights } from '@/lib/utils/intentScore'
import { getIntentSignals } from '@/lib/services/intent'

type Params = { params: Promise<{ id: string }> }

const VALID: ReadonlyArray<string> = ['paying', 'not_paying', 'pending']

// Marca o Stage 2 (Actual Close / paying client) de uma call. Separado do
// Stage 1 (Initial Result = call_outcome). Owner-only write (admin impersonando
// é read-only via requireOwnerWrite). Ao virar 'paying', grava o snapshot do
// intent previsto (intent_at_close) — comporta o loop de aprendizado futuro.
export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return unauthorized()

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const role = await getRole()
  if (role === 'trainer') return forbidden()

  const orgId = await getOrgId()
  if (!orgId) return notFound('Call')

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const stage2Outcome = String(body?.stage2Outcome ?? '')
  if (!VALID.includes(stage2Outcome)) {
    return ok({ data: null, error: { message: 'Invalid stage2Outcome', code: 400 } })
  }

  // Snapshot do intent previsto só quando vira pagante. Usa o intent já
  // computado da call (mesma fórmula do CallDetail), com pesos atuais da org.
  let intentAtClose: number | null = null
  if (stage2Outcome === 'paying') {
    const call = await getCallById(id, { orgId })
    if (!call) return notFound('Call')
    if (call.result === 'closed') {
      intentAtClose = 5
    } else if (call.intentBreakdown) {
      const signals = await getIntentSignals().catch(() => [])
      const weights = call.intentWeights ?? resolveIntentWeights(signals)
      intentAtClose = computeIntentIndex(call.intentBreakdown, weights)
    } else {
      intentAtClose = call.intent ?? null
    }
  }

  const updated = await dbMarkStage2(id, orgId, {
    stage2Outcome: stage2Outcome as 'paying' | 'not_paying' | 'pending',
    intentAtClose,
  })
  if (!updated) return notFound('Call')

  return ok({
    stage2Outcome: updated.stage2_outcome,
    becamePayingAt: updated.became_paying_at,
    intentAtClose: updated.intent_at_close,
  })
}
