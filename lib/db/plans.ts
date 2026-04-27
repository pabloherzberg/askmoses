import { createAdminClient } from '@/lib/supabase/admin'
import type { Plan, PlanCode } from '@/lib/types'

interface DbPlanRow {
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

function toPlan(row: DbPlanRow): Plan {
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

export async function dbGetPlans(): Promise<Plan[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .order('price_cents', { ascending: true })

  if (error) throw new Error(`dbGetPlans: ${error.message}`)
  return (data ?? []).map((row) => toPlan(row as DbPlanRow))
}

export async function dbGetPlanById(id: string): Promise<Plan | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetPlanById: ${error.message}`)
  }
  return toPlan(data as DbPlanRow)
}

export async function dbGetPlanByCode(code: PlanCode): Promise<Plan | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('code', code)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetPlanByCode: ${error.message}`)
  }
  return toPlan(data as DbPlanRow)
}
