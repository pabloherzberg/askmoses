export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { getCalls } from '@/lib/services/calls'
import { getTrainerDbId } from '@/lib/auth'
import { TrainerCallsTable } from './TrainerCallsTable'

export default async function TrainerCallsPage() {
  const trainerId = await getTrainerDbId()
  const calls = trainerId ? await getCalls({ trainerId }) : []
  const t = await getTranslations('Trainer')

  return (
    <div>
      <TrainerCallsTable
        calls={calls}
        sectionLabel={t('myCallsLabel')}
        title={t('myCallsLabel')}
      />
    </div>
  )
}
