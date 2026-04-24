import { getTranslations } from 'next-intl/server'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { TrainerTabs } from '@/components/shared/TrainerTabs'
import { BestCallsTeamWeekly } from '@/components/shared/BestCallsTeamWeekly'
import { WorstCallsTeamWeekly } from '@/components/shared/WorstCallsTeamWeekly'

export default async function TeamCommandCenterPage() {
  const t = await getTranslations('Coaching')
  return (
    <div>
      <SectionLabel>{t('label')}</SectionLabel>
      <p className="text-sm mb-6" style={{ color: 'var(--am-muted)' }}>
        {t('subtitle')}
      </p>
      <BestCallsTeamWeekly />
      <WorstCallsTeamWeekly />
      <TrainerTabs />
    </div>
  )
}
