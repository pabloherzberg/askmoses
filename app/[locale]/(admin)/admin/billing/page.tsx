export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { currentMonthUtc } from '@/lib/billing-month'
import { UsageBlock } from '@/components/shared/billing/UsageBlock'
import { CycleBlock } from '@/components/shared/billing/CycleBlock'

// Visão ADMIN da feature de Billing. Vê todas as orgs + dados internos (COGS,
// LLM cost). Protegida pelo middleware (/admin/* → admin only). Dados via MSW
// (fetch client-side dentro dos blocos).
export default async function AdminBillingPage() {
  const t = await getTranslations('Billing')

  return (
    <div>
      <div className="mb-2">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {t('title')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
          {t('admin.subtitle')}
        </p>
      </div>

      <UsageBlock
        scope="admin"
        labels={{
          title: t('block1.title'),
          hint: t('admin.block1Hint'),
          callsAnalyzed: t('cards.callsAnalyzed'),
          billableMinutes: t('cards.billableMinutes'),
          estimatedValue: t('cards.estimatedValue'),
          estimatedValueNote: t('admin.estimatedValueNote'),
          inSelectedPeriod: t('cards.inSelectedPeriod'),
          avgCallLength: t('cards.avgCallLength'),
          activePayingOrgs: t('admin.activePayingOrgs'),
          freePilotNote: t('admin.freePilotNote'),
          minSuffix: t('cards.minSuffix'),
          valueByOrgTitle: t('admin.valueByOrgTitle'),
          callsPerDayTitle: '',
          callsPerDaySubtitle: '',
        }}
      />

      <CycleBlock
        scope="admin"
        defaultMonth={currentMonthUtc()}
        adminLabels={{
          title: t('block2.title'),
          hint: t('admin.block2Hint'),
          amountDue: t('admin.amountDue'),
          payingOrgsNote: t('admin.payingOrgsNote'),
          billableMinutes: t('admin.billableMinutesMonth'),
          closedMonth: t('admin.closedMonth'),
          cogs: t('admin.cogs'),
          cogsTag: t('admin.cogsTag'),
          footerNote: t('admin.footerNote'),
          table: {
            organization: t('table.organization'),
            status: t('table.status'),
            plan: t('table.plan'),
            rate: t('table.rate'),
            billableMin: t('table.billableMin'),
            callsBilled: t('table.callsBilled'),
            amount: t('table.amount'),
            llmCosts: t('table.llmCosts'),
            actions: t('table.actions'),
            totalPaid: t('table.totalPaid'),
            editRate: t('table.editRate'),
            viewUsage: t('table.viewUsage'),
            dialog: {
              title: t('editRate.title'),
              description: t('editRate.description'),
              rateLabel: t('editRate.rateLabel'),
              hint: t('editRate.hint'),
              cancel: t('editRate.cancel'),
              save: t('editRate.save'),
              saving: t('editRate.saving'),
              invalid: t('editRate.invalid'),
            },
          },
        }}
      />
    </div>
  )
}
