export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { getCalls } from '@/lib/services/calls'
import { getRole, getTrainerDbId } from '@/lib/auth'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { CallsTable } from './CallsTable'

export default async function CallsPage() {
  const [role, t] = await Promise.all([getRole(), getTranslations('Owner.calls')])
  const isTrainer = role === 'trainer'
  const trainerId = isTrainer ? await getTrainerDbId() : undefined

  const calls = await getCalls(trainerId ? { trainerId } : undefined)

  const countLabel = calls.length === 1
    ? t('callsAnalyzedOne', { count: calls.length })
    : t('callsAnalyzedOther', { count: calls.length })

  return (
    <div>
      <div className="mb-6">
        <SectionLabel>{isTrainer ? t('myCallsLabel') : t('teamCallsLabel')}</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {isTrainer ? t('myCalls') : t('allCalls')}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--am-muted)' }}>
          {countLabel}
        </p>
      </div>

      <CallsTable calls={calls} showTrainerColumn={!isTrainer} />
    </div>
  )
}
