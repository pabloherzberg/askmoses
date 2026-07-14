import { type NextRequest } from 'next/server'
import { dbListGhlEnabledOrgs, dbMarkOrgGhlAuthError } from '@/lib/db/organizations'
import { dbUpdateGhlOpportunity } from '@/lib/db/calls'
import { fetchOpportunitiesByStatus, GhlAuthError } from '@/lib/services/ghl-api'
import { notifyPipelineFailure } from '@/lib/services/pipeline-alerts'

// GET /api/cron/sync-ghl-opportunities
//
//   Alternativa por POLLING ao webhook OpportunityStageChanged/
//   OpportunityStatusChanged: em vez de depender de um workflow configurado
//   no GHL disparando o evento, este cron varre 1x/dia as opportunities
//   'won' e 'lost' de cada org via GET /opportunities/search e atualiza
//   calls.ghl_won_status pelo mesmo caminho que o webhook usa
//   (dbUpdateGhlOpportunity, chave contact_id).
//
//   Não substitui o webhook (que continua funcionando se configurado) —
//   é um safety net/alternativa pra quem não quer mexer no GHL.
//
//   Auth: header 'Authorization: Bearer $CRON_SECRET' (padrão Vercel Cron).

const STATUSES_TO_SYNC = ['won', 'lost'] as const

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return Response.json({ error: 'forbidden' }, { status: 401 })
  }

  let orgs
  try {
    orgs = await dbListGhlEnabledOrgs()
  } catch (err) {
    console.error('[cron/sync-ghl-opportunities] failed to list orgs:', err)
    return Response.json({ error: 'failed to list orgs' }, { status: 500 })
  }

  let orgsScanned = 0
  let opportunitiesFound = 0
  let updated = 0
  let errored = 0

  for (const org of orgs) {
    orgsScanned += 1
    try {
      for (const status of STATUSES_TO_SYNC) {
        const opportunities = await fetchOpportunitiesByStatus(
          org.locationId,
          org.accessToken,
          status,
        )
        opportunitiesFound += opportunities.length

        for (const opp of opportunities) {
          if (!opp.contactId || !opp.status) continue
          try {
            await dbUpdateGhlOpportunity(org.orgId, opp.contactId, opp.id, opp.status)
            updated += 1
          } catch (err) {
            errored += 1
            console.error('[cron/sync-ghl-opportunities] update failed', {
              orgId: org.orgId,
              opportunityId: opp.id,
              err,
            })
          }
        }
      }
    } catch (err) {
      errored += 1
      if (err instanceof GhlAuthError) {
        // PIT rotacionado/revogado — mesmo tratamento do pipeline de calls:
        // marca a org pra acender o banner no admin, não derruba o cron inteiro.
        await dbMarkOrgGhlAuthError(org.orgId).catch(() => {})
      }
      console.error('[cron/sync-ghl-opportunities] org sync failed', {
        orgId: org.orgId,
        err,
      })
      await notifyPipelineFailure('webhook_failed', {
        callId: `sync-error:opportunities-cron:${org.orgId}`,
        orgId: org.orgId,
        error: err,
        stage: 'webhook',
        reason: err instanceof GhlAuthError ? 'ghl_auth_expired' : 'ghl_api_error',
        meta: { operation: 'sync-ghl-opportunities', locationId: org.locationId },
      }).catch(() => {})
    }
  }

  return Response.json({
    orgsScanned,
    opportunitiesFound,
    updated,
    errored,
  })
}
