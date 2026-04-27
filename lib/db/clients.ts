import { createAdminClient } from '@/lib/supabase/admin'
import type { Client, GlobalMetrics, HealthStatus, Plan, PlanCode } from '@/lib/types'

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

interface DbClientRow {
  id: string
  name: string
  plan_id: string
  org_id: string
  calls_this_month: number
  avg_score: number
  mrr: number
  health: HealthStatus
  trainers_count: number
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

function toClient(row: DbClientRow): Client {
  if (!row.plans) {
    throw new Error(`Client ${row.id} has no plan join (plan_id=${row.plan_id})`)
  }
  return {
    id: row.id,
    name: row.name,
    planId: row.plan_id,
    plan: toPlan(row.plans),
    orgId: row.org_id,
    callsThisMonth: row.calls_this_month ?? 0,
    avgScore: row.avg_score ?? 0,
    mrr: Number(row.mrr ?? 0),
    health: row.health,
    trainersCount: row.trainers_count ?? 0,
  }
}

/**
 * Lista clientes (organizações) do banco com plano embutido.
 */
export async function dbGetClients(): Promise<Client[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('clients')
    .select('*, plans(*)')
    .order('name', { ascending: true })

  if (error) throw new Error(`dbGetClients: ${error.message}`)

  return (data ?? []).map((row) => toClient(row as DbClientRow))
}

/**
 * Retorna o client (com plano embutido) vinculado a um org_id.
 * Usado por rotas autenticadas para resolver o plano do tenant atual.
 */
export async function dbGetClientByOrgId(orgId: string): Promise<Client | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('clients')
    .select('*, plans(*)')
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetClientByOrgId: ${error.message}`)
  }

  return data ? toClient(data as DbClientRow) : null
}

/**
 * Calcula métricas globais (MRR, total calls, avg score).
 */
export async function dbGetGlobalMetrics(): Promise<GlobalMetrics> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('clients')
    .select('mrr, calls_this_month, avg_score')

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
