import { getTranslations } from 'next-intl/server'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { MarketingIntelligence } from '@/components/shared/MarketingIntelligence'

export default async function MarketingIntelligencePage() {
  const t = await getTranslations('Marketing')
  return (
    <div>
      <SectionLabel>{t('sectionLabel')}</SectionLabel>
      <p className="text-sm mb-6" style={{ color: 'var(--am-muted)' }}>
        {t('subtitle')}
      </p>
      <MarketingIntelligence />
    </div>
  )
}
