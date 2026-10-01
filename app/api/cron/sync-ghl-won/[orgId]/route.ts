import { type NextRequest } from 'next/server'
import { dbGetOrgGhlConfigByOrgId, dbMarkOrgGhlAuthError } from '@/lib/db/organizations'
import { syncOrgWon } from '@/lib/services/ghl-won-sync'
import { GhlAuthError } from '@/lib/services/ghl-api'
import { notifyPipelineFailure } from '@/lib/services/pipeline-alerts'

// GET /api/cron/sync-ghl-won/[orgId] — sync de Won de UMA org.
//
//   Disparado pelo dispatcher /api/cron/sync-ghl-won. Revisita os leads da org
//   que ainda não são Won (consultados há mais tempo primeiro) até acabar a
//   fila ou o orçamento. O que sobrar é o primeiro da fila no dia seguinte.
//
//   Auth: header 'Authorization: Bearer $CRON_SECRET'.

export const maxDuration = 300

// Folga de 60s para os requests em voo terminarem antes do corte da Vercel.
const BUDGET_MS = 240_000

type Params = { params: Promise<{ orgId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const auth = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return Response.json({ error: 'forbidden' }, { status: 401 })
  }

  const { orgId } = await params
  const org = await dbGetOrgGhlConfigByOrgId(orgId)
  if (!org) {
    return Response.json({ error: 'org sem GHL ativo ou sem credenciais' }, { status: 404 })
  }

  try {
    const result = await syncOrgWon(org, { budgetMs: BUDGET_MS })
    if (result.stoppedByBudget) {
      console.warn('[cron/sync-ghl-won] orçamento esgotado — restante fica para amanhã', { orgId, ...result })
    }
    return Response.json({ orgId, ...result })
  } catch (err) {
    if (err instanceof GhlAuthError) {
      // PIT rotacionado/revogado — acende o banner do admin.
      await dbMarkOrgGhlAuthError(orgId).catch(() => {})
    }
    console.error('[cron/sync-ghl-won] org sync failed', { orgId, err })
    await notifyPipelineFailure('webhook_failed', {
      callId: `sync-error:won-cron:${orgId}`,
      orgId,
      orgName: org.orgName,
      error: err,
      stage: 'webhook',
      reason: err instanceof GhlAuthError ? 'ghl_auth_expired' : 'ghl_api_error',
      meta: { operation: 'sync-ghl-won', locationId: org.locationId },
    }).catch(() => {})
    return Response.json({ orgId, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
