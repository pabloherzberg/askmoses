import { getCalls } from '@/lib/services/calls'
import { getTrainerDbId } from '@/lib/auth'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { TrainerCallsTable } from './TrainerCallsTable'

export default async function TrainerCallsPage() {
  const trainerId = await getTrainerDbId()
  const calls = trainerId ? await getCalls({ trainerId }) : []

  return (
    <div>
      <div className="mb-6">
        <SectionLabel>My Calls</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          My Calls
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--am-muted)' }}>
          {calls.length} {calls.length === 1 ? 'call' : 'calls'} analyzed
        </p>
      </div>

      <TrainerCallsTable calls={calls} />
    </div>
  )
}
