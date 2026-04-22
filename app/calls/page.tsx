export const dynamic = 'force-dynamic'

import { getCalls } from '@/lib/services/calls'
import { getRole, getTrainerDbId } from '@/lib/auth'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { CallsTable } from './CallsTable'

export default async function CallsPage() {
  const role = await getRole()
  const isTrainer = role === 'trainer'
  const trainerId = isTrainer ? await getTrainerDbId() : undefined

  const calls = await getCalls(trainerId ? { trainerId } : undefined)

  return (
    <div>
      <div className="mb-6">
        <SectionLabel>{isTrainer ? 'My Calls' : 'Team Calls'}</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {isTrainer ? 'My Calls' : 'All Calls'}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--am-muted)' }}>
          {calls.length} {calls.length === 1 ? 'call' : 'calls'} analyzed
        </p>
      </div>

      <CallsTable calls={calls} showTrainerColumn={!isTrainer} />
    </div>
  )
}
