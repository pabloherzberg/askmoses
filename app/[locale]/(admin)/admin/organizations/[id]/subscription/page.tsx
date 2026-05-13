export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { SubscriptionOverrideForm } from './SubscriptionOverrideForm'

type PlanCode = 'starter' | 'pro' | 'pro_rag'
type SubStatus = 'active' | 'inactive' | 'trial'

interface PageProps {
  params: Promise<{ id: string; locale: string }>
}

// Layout (admin) já garante role=admin via middleware. Aqui só carregamos
// o estado atual da subscription pra hidratar o form com defaults.
export default async function SubscriptionPage({ params }: PageProps) {
  const { id: orgId } = await params

  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organizations')
    .select('id, name, subscription_status, trial_ends_at, plans(code)')
    .eq('id', orgId)
    .maybeSingle()

  if (!org) notFound()

  const plan = (org as { plans?: { code: PlanCode } | null } | null)?.plans ?? null

  return (
    <div className="max-w-2xl">
      <SubscriptionOverrideForm
        orgId={(org as { id: string }).id}
        orgName={(org as { name: string }).name}
        initialStatus={(org as { subscription_status: SubStatus }).subscription_status}
        initialPlanCode={plan?.code ?? null}
        initialTrialEndsAt={(org as { trial_ends_at: string | null }).trial_ends_at}
      />
    </div>
  )
}
