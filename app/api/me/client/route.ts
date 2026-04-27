import { getOrgId, ok, unauthorized, notFound } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Client, HealthStatus, Plan, PlanCode } from '@/lib/types'

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
 * GET /api/me/client
 * Returns the Client (with embedded Plan) tied to the caller's org_id.
 * Any authenticated user with an org_id in their JWT can call this — used
 * by dashboard chrome to show the active plan and gate premium features.
 */
export async function GET() {
  const orgId = await getOrgId()
  if (!orgId) return unauthorized()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clients')
    .select('*, plans(*)')
    .eq('org_id', orgId)
    .single()

  if (error || !data) return notFound('Client')

  return ok(toClient(data as DbClientRow))
}
