export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { getCalls } from '@/lib/services/calls'
import { getTrainerDbId } from '@/lib/auth'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { TrainerCallsTable } from './TrainerCallsTable'

export default async function TrainerCallsPage() {
  const trainerId = await getTrainerDbId()
  const calls = trainerId ? await getCalls({ trainerId }) : []
  const t = await getTranslations('Trainer')

  const countLabel = calls.length === 1
    ? t('callsAnalyzedOne', { count: calls.length })
    : t('callsAnalyzedOther', { count: calls.length })

  return (
    <div>
      <div className="mb-6">
        <SectionLabel>{t('myCallsLabel')}</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {t('myCallsLabel')}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--am-muted)' }}>
          {countLabel}
        </p>
      </div>

      <TrainerCallsTable calls={calls} />
    </div>
  )
}
