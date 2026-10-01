import { fetchContactOpportunities, GhlAuthError, type GhlOpportunity } from '@/lib/services/ghl-api'
import {
  dbApplyGhlLeadStatus,
  dbListLeadsToRevisit,
  type ApplyGhlLeadStatusResult,
  type GhlLeadSource,
  type GhlLeadStatus,
} from '@/lib/db/ghl-leads'

// Sync do Won POR LEAD (migration 125).
//
// Para cada contato que tem call no AskMoses, consulta no GHL só as
// opportunities daquele contato e grava o status do lead. As calls herdam o
// status e o Stage 2 é marcado na mesma transação (apply_ghl_lead_status).
//
// Usado por três caminhos, com a mesma regra:
//   - webhook de opportunity (tempo real): reconsulta o contato inteiro, então
//     um Lost de outra opportunity não apaga o Won;
//   - cron diário, uma execução por org: revisita os leads ainda não-Won;
//   - backfill (scripts/backfill-ghl-won-por-lead.mts).

export interface ResolvedLead {
  ghlStatus: GhlLeadStatus
  wonAt: string | null
  opportunityId: string | null
  pipelineId: string | null
  stageId: string | null
}

const norm = (s: string | null) => (s ?? '').trim().toLowerCase()
const changedAt = (o: GhlOpportunity) => o.lastStatusChangeAt ?? o.updatedAt ?? null

/**
 * Status do lead a partir das opportunities do contato, de QUALQUER pipeline:
 * alguma won → won (Won prevalece sobre lost); won_at é o da won mais recente.
 * Sem won: lost > open > abandoned > none.
 */
export function resolveLeadFromOpportunities(opps: GhlOpportunity[]): ResolvedLead {
  const won = opps
    .filter((o) => norm(o.status) === 'won')
    .sort((a, b) => (changedAt(b) ?? '').localeCompare(changedAt(a) ?? ''))
  if (won.length > 0) {
    const o = won[0]
    return {
      ghlStatus: 'won',
      wonAt: changedAt(o),
      opportunityId: o.id,
      pipelineId: o.pipelineId,
      stageId: o.pipelineStageId,
    }
  }
  const statuses = new Set(opps.map((o) => norm(o.status)))
  const ghlStatus: GhlLeadStatus = statuses.has('lost')
    ? 'lost'
    : statuses.has('open')
      ? 'open'
      : statuses.has('abandoned')
        ? 'abandoned'
        : 'none'
  return { ghlStatus, wonAt: null, opportunityId: null, pipelineId: null, stageId: null }
}

export interface GhlOrgAccess {
  orgId: string
  locationId: string
  accessToken: string
}

/** Consulta o contato no GHL e grava o status do lead. */
export async function syncLeadWon(
  org: GhlOrgAccess,
  contactId: string,
  source: GhlLeadSource,
): Promise<ApplyGhlLeadStatusResult> {
  const opps = await fetchContactOpportunities(org.locationId, org.accessToken, contactId)
  const lead = resolveLeadFromOpportunities(opps)
  return dbApplyGhlLeadStatus({ orgId: org.orgId, contactId, ...lead, source })
}

export interface OrgSyncResult {
  leadsChecked: number
  becameWon: number
  errors: number
  /** true quando o orçamento de tempo acabou antes da fila; o resto fica pro dia seguinte. */
  stoppedByBudget: boolean
}

// Concorrência por location: o GHL limita ~100 req/10s por location, e cada
// lead é 1 request (mais retry em 429, em fetchContactOpportunities).
const DEFAULT_CONCURRENCY = 4
// Fila máxima por execução. A ordem (consultado há mais tempo primeiro) faz o
// que não couber hoje ser o primeiro amanhã.
const MAX_LEADS_PER_RUN = 3000

/**
 * Revisita os leads não-Won de UMA org até acabar a fila ou o orçamento de
 * tempo. GhlAuthError sobe (PIT morto vale para todos os leads); erro pontual
 * de um lead só conta em `errors`.
 */
export async function syncOrgWon(
  org: GhlOrgAccess,
  opts: { budgetMs: number; concurrency?: number; now?: () => number },
): Promise<OrgSyncResult> {
  const now = opts.now ?? Date.now
  const deadline = now() + opts.budgetMs
  const contacts = await dbListLeadsToRevisit(org.orgId, MAX_LEADS_PER_RUN)
  const result: OrgSyncResult = { leadsChecked: 0, becameWon: 0, errors: 0, stoppedByBudget: false }

  let next = 0
  let authError: GhlAuthError | null = null
  const worker = async () => {
    while (next < contacts.length && !authError) {
      if (now() >= deadline) {
        result.stoppedByBudget = true
        return
      }
      const contactId = contacts[next++]
      try {
        const r = await syncLeadWon(org, contactId, 'sync')
        result.leadsChecked += 1
        if (r.status === 'won') result.becameWon += 1
      } catch (err) {
        if (err instanceof GhlAuthError) {
          authError = err
          return
        }
        result.errors += 1
        console.error('[ghl-won-sync] lead falhou', { orgId: org.orgId, contactId, err })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? DEFAULT_CONCURRENCY, contacts.length) }, worker))

  if (authError) throw authError
  return result
}
