import { getTranslations } from 'next-intl/server'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { AiControlsClient } from './AiControlsClient'
import { aiModuleConfigs, aiModuleConfigLog } from '@/lib/mock-data'

export default async function AiControlsPage() {
  const t = await getTranslations('Admin.aiControls')

  return (
    <div>
      <div className="mb-6">
        <SectionLabel>{t('label')}</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {t('title')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
          {t('subtitle')}
        </p>
      </div>

      <AiControlsClient
        initialConfigs={[...aiModuleConfigs]}
        initialLog={[...aiModuleConfigLog]}
      />
    </div>
  )
}
