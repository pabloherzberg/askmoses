export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { getIntentSignals, getDefaultOrgIntentWeights, getOrgIntentWeightsForScoring } from '@/lib/services/intent'
import { getActiveOrgContext } from '@/lib/auth'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { IntentDashboard } from '@/components/shared/IntentDashboard'
import { IntentWeightsManager } from '@/components/admin/IntentWeightsManager'

export default async function IntentAnalysisPage() {
  const [signals, t, ctx] = await Promise.all([
    getIntentSignals().catch(() => []),
    getTranslations('Intent'),
    getActiveOrgContext(),
  ])

  const orgId = ctx?.activeOrgId
  const canConfig = (ctx?.role === 'owner' || ctx?.role === 'admin') && !!orgId

  // Pesos atuais da org (base 100) — só carrega se o usuário pode configurar.
  const initialWeights = canConfig
    ? { ...getDefaultOrgIntentWeights(orgId!), ...(await getOrgIntentWeightsForScoring(orgId!)) }
    : null

  return (
    <div>
      <SectionLabel>{t('sectionLabel')}</SectionLabel>
      <p className="text-sm mb-6" style={{ color: 'var(--am-muted)' }}>
        {t('subtitle')}
      </p>

      {/* Radar (Team / By Seller) + top leads */}
      {signals.length > 0 ? (
        <IntentDashboard signals={signals} />
      ) : (
        <p className="text-sm" style={{ color: 'var(--am-muted)' }}>
          {t('noCallsFound')}
        </p>
      )}

      {/* Config dos pesos (igual rubric) + sucesso por stage — abaixo do radar */}
      {canConfig && initialWeights && (
        <div className="mt-8">
          <IntentWeightsManager orgId={orgId!} initialWeights={initialWeights} scope="owner" />
        </div>
      )}
    </div>
  )
}
