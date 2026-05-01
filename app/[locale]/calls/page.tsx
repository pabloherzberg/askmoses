export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { getCalls } from '@/lib/services/calls'
import { getRole, getTrainerDbId } from '@/lib/auth'
import { CallsTable } from './CallsTable'

export default async function CallsPage() {
  const [role, t] = await Promise.all([getRole(), getTranslations('Owner.calls')])
  const isTrainer = role === 'trainer'
  const trainerId = isTrainer ? await getTrainerDbId() : undefined

  const calls = await getCalls(trainerId ? { trainerId } : undefined)

  return (
    <div>
      <CallsTable
        calls={calls}
        showTrainerColumn={!isTrainer}
        sectionLabel={isTrainer ? t('myCallsLabel') : t('teamCallsLabel')}
        title={isTrainer ? t('myCalls') : t('allCalls')}
      />
    </div>
  )
}
