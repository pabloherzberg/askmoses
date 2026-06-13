export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { currentMonthUtc } from '@/lib/billing-month'
import { UsageBlock } from '@/components/shared/billing/UsageBlock'
import { CycleBlock } from '@/components/shared/billing/CycleBlock'

// Visão OWNER da feature de Billing. Vê SÓ a própria org — sem COGS, sem LLM
// cost, sem outras orgs (o handler MSW remove esses campos do payload owner).
// Herda dashboard/layout.tsx; middleware protege /dashboard/* (trainer → /me).
export default async function OwnerBillingPage() {
  const t = await getTranslations('Billing')

  return (
    <div>
      <div className="mb-2">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {t('title')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
          {t('owner.subtitle')}
        </p>
      </div>

      <UsageBlock
        scope="owner"
        labels={{
          title: t('block1.title'),
          hint: t('owner.block1Hint'),
          callsAnalyzed: t('cards.callsAnalyzed'),
          billableMinutes: t('cards.billableMinutes'),
          estimatedValue: t('cards.estimatedValue'),
          estimatedValueNote: t('owner.estimatedValueNote'),
          inSelectedPeriod: t('cards.inSelectedPeriod'),
          avgCallLength: t('cards.avgCallLength'),
          activePayingOrgs: '',
          freePilotNote: '',
          minSuffix: t('cards.minSuffix'),
          valueByOrgTitle: '',
          callsPerDayTitle: t('owner.callsPerDayTitle'),
          callsPerDaySubtitle: t('owner.callsPerDaySubtitle'),
        }}
      />

      <CycleBlock
        scope="owner"
        defaultMonth={currentMonthUtc()}
        ownerLabels={{
          title: t('block2.title'),
          hint: t('owner.block2Hint'),
          amountDueTitle: t('owner.amountDueTitle'),
          amountDueFor: t('owner.amountDueFor'),
          updatesTag: t('owner.updatesTag'),
          howTitle: t('owner.howTitle'),
          callsBilled: t('owner.callsBilledMonth'),
          billableMin: t('owner.billableMinutesMonth'),
          avgCallLength: t('cards.avgCallLength'),
          yourRate: t('owner.yourRate'),
          minSuffix: t('cards.minSuffix'),
          perMinSuffix: t('owner.perMinSuffix'),
          usageHistory: t('owner.usageHistory'),
          inProgress: t('owner.inProgress'),
          colPeriod: t('owner.colPeriod'),
          colCalls: t('owner.colCalls'),
          colMinutes: t('owner.colMinutes'),
          colAmount: t('owner.colAmount'),
          payTitle: t('owner.payTitle'),
          payBody: t('owner.payBody'),
        }}
      />
    </div>
  )
}
