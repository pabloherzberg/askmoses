import { redirect } from 'next/navigation'
import { getActiveOrgContext, type PlanCode } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { PlanPicker } from './PlanPicker'

export interface PlanOption {
  code: PlanCode
  name: string
  priceCents: number
  hasRag: boolean
  hasTwilio: boolean
  hasManualUpload: boolean
  maxSalesPeople: number | null
  features: string[]
}

interface PlanRow {
  code: string
  name: string
  price_cents: number
  has_rag: boolean
  has_twilio: boolean
  has_manual_upload: boolean
  max_sales_people: number | null
  features: unknown
}

export default async function OnboardingPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  const sp = await searchParams

  const ctx = await getActiveOrgContext()
  if (!ctx) redirect(`/${locale}/login`)

  if (ctx.role !== 'owner') redirect(`/${locale}/login`)

  if (ctx.subscriptionStatus === 'active') redirect(`/${locale}/dashboard`)

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('plans')
    .select('code, name, price_cents, has_rag, has_twilio, has_manual_upload, max_sales_people, features')
    .order('price_cents', { ascending: true })

  if (error || !data) {
    console.error('[onboarding/plan] Não foi possível carregar os planos', error)
  }

  const plans: PlanOption[] = ((data ?? []) as PlanRow[]).map((p) => ({
    code: p.code as PlanCode,
    name: p.name,
    priceCents: p.price_cents,
    hasRag: p.has_rag,
    hasTwilio: p.has_twilio,
    hasManualUpload: p.has_manual_upload,
    maxSalesPeople: p.max_sales_people,
    features: Array.isArray(p.features) ? (p.features as string[]) : [],
  }))

  // Params do Stripe vindos do fluxo: checkout → /success → /signup → email → aqui
  const stripePlan = typeof sp.plan === 'string' ? sp.plan : undefined
  const stripeSessionId = typeof sp.session_id === 'string' ? sp.session_id : undefined

  return (
    <PlanPicker
      plans={plans}
      stripePlan={stripePlan}
      stripeSessionId={stripeSessionId}
    />
  )
}
