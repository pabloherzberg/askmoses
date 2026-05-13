import { createAdminClient } from '@/lib/supabase/admin'
import type { Client, GlobalMetrics, HealthStatus, Plan, PlanCode } from '@/lib/types'

// Após migration 038 a tabela `clients` foi mesclada em `organizations`.
// O tipo TS `Client` continua existindo como shape lida pelas telas Admin
// — só a fonte de dados mudou. As funções abaixo lêem direto de
// organizations + plans e remontam o shape `Client` pra não impactar
// callers (admin pages, métricas globais, etc.).
//
// Conceitualmente: 1 organization == 1 client. O `orgId` no shape é
// redundante com o `id`, mas mantido pra preservar a API pública.

interface DbPlanNested {
  id: string
  code: PlanCode
  name: string
  price_cents: number
  timeline_weeks: number
  has_rag: boolean
  has_twilio: boolean
  has_manual_upload: boolean
  max_sales_people: number | null
  features: string[] | null
}

interface DbOrgRow {
  id: string
  name: string
  plan_id: string | null
  calls_this_month: number | null
  avg_score: number | null
  mrr: number | null
  health: HealthStatus
  trainers_count: number | null
  subscription_status: 'active' | 'inactive' | 'trial'
  plans: DbPlanNested | null
}

function toPlan(row: DbPlanNested): Plan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    priceCents: row.price_cents,
    timelineWeeks: row.timeline_weeks,
    hasRag: row.has_rag,
    hasTwilio: row.has_twilio,
    hasManualUpload: row.has_manual_upload,
    maxSalesPeople: row.max_sales_people,
    features: row.features ?? [],
  }
}

function toClient(row: DbOrgRow, ownerAccepted: boolean): Client {
  if (!row.plans) {
    // Pós-merge: org pode existir sem plano (Owner em onboarding step-2).
    // Antes esse caso não existia (clients sempre tinha plan_id NOT NULL na
    // prática). Quem consome essa função em listagens deve filtrar por
    // plan_id NOT NULL ou tratar org-sem-plano explicitamente. Aqui
    // levantamos pra não silenciosamente retornar shape inconsistente.
    throw new Error(`Organization ${row.id} has no plan (plan_id=${row.plan_id ?? 'null'})`)
  }
  return {
    id: row.id,
    name: row.name,
    planId: row.plan_id ?? '',
    plan: toPlan(row.plans),
    orgId: row.id,
    callsThisMonth: row.calls_this_month ?? 0,
    avgScore: row.avg_score ?? 0,
    mrr: Number(row.mrr ?? 0),
    health: row.health,
    trainersCount: row.trainers_count ?? 0,
    ownerAccepted,
    subscriptionStatus: row.subscription_status,
  }
}

/**
 * Lista clientes (organizations) com plano embutido + flag ownerAccepted.
 * Filtra orgs sem plano (sub não-ativada / mid-onboarding).
 *
 * ownerAccepted = existe membership com role='owner' e invite_status='accepted'.
 * Quando false, Admin criou a org+invite mas Owner ainda não clicou no magic
 * link — UI mostra chip "Aguardando Owner" ao lado do nome.
 */
export async function dbGetClients(): Promise<Client[]> {
  const supabase = createAdminClient()

  const [orgsRes, ownersRes] = await Promise.all([
    supabase
      .from('organizations')
      .select(
        'id, name, plan_id, calls_this_month, avg_score, mrr, health, trainers_count, subscription_status, plans(*)'
      )
      .not('plan_id', 'is', null)
      .order('name', { ascending: true }),
    supabase
      .from('memberships')
      .select('org_id')
      .eq('role', 'owner')
      .eq('invite_status', 'accepted'),
  ])

  if (orgsRes.error) throw new Error(`dbGetClients: ${orgsRes.error.message}`)
  if (ownersRes.error) throw new Error(`dbGetClients (memberships): ${ownersRes.error.message}`)

  // Set de org_ids que têm pelo menos 1 owner aceito. Lookup O(1) no map abaixo.
  const ownerAcceptedSet = new Set(
    (ownersRes.data ?? []).map((m: { org_id: string }) => m.org_id),
  )

  return (orgsRes.data ?? []).map((row) =>
    toClient(row as unknown as DbOrgRow, ownerAcceptedSet.has((row as { id: string }).id)),
  )
}

/**
 * Retorna o client (com plano embutido) vinculado a um org_id.
 * Pós-merge: orgId === clientId. Mantém a assinatura antiga.
 */
export async function dbGetClientByOrgId(orgId: string): Promise<Client | null> {
  const supabase = createAdminClient()

  const [orgRes, ownerRes] = await Promise.all([
    supabase
      .from('organizations')
      .select(
        'id, name, plan_id, calls_this_month, avg_score, mrr, health, trainers_count, subscription_status, plans(*)'
      )
      .eq('id', orgId)
      .maybeSingle(),
    supabase
      .from('memberships')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('role', 'owner')
      .eq('invite_status', 'accepted'),
  ])

  if (orgRes.error) {
    if (orgRes.error.code === 'PGRST116') return null
    throw new Error(`dbGetClientByOrgId: ${orgRes.error.message}`)
  }

  if (!orgRes.data) return null
  // Org sem plano (onboarding mid-flight) não vira Client — caller decide
  // o que fazer (Admin views, métricas etc. tratam como "sem assinatura").
  if (!(orgRes.data as { plan_id: string | null }).plan_id) return null

  const ownerAccepted = (ownerRes.count ?? 0) > 0
  return toClient(orgRes.data as unknown as DbOrgRow, ownerAccepted)
}

/**
 * Métricas globais (MRR, total calls, avg score) agregadas pelas
 * organizations com plano ativo. Orgs sem plano ficam de fora pra não
 * contaminar o avg_score / MRR com zeros do estado de onboarding.
 */
export async function dbGetGlobalMetrics(): Promise<GlobalMetrics> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('organizations')
    .select('mrr, calls_this_month, avg_score')
    .not('plan_id', 'is', null)

  if (error) throw new Error(`dbGetGlobalMetrics: ${error.message}`)

  const rows = (data ?? []) as Array<{ mrr: number; calls_this_month: number; avg_score: number }>
  return {
    totalClients: rows.length,
    totalCallsThisMonth: rows.reduce((s, r) => s + (r.calls_this_month ?? 0), 0),
    totalMRR: rows.reduce((s, r) => s + Number(r.mrr ?? 0), 0),
    avgScore: rows.length
      ? Math.round(rows.reduce((s, r) => s + (r.avg_score ?? 0), 0) / rows.length)
      : 0,
  }
}
