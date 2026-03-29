import { getCalls } from '@/lib/services/calls'
import { getTrainers } from '@/lib/services/trainers'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { CallsTable } from './CallsTable'

export default async function CallsPage() {
  const [calls, trainers] = await Promise.all([getCalls(), getTrainers()])

  return (
    <div>
      <div className="mb-6">
        <SectionLabel>Team Calls</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          All Calls
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--am-muted)' }}>
          {calls.length} calls across {trainers.length} trainers
        </p>
      </div>

      <CallsTable calls={calls} trainers={trainers} />
    </div>
  )
}
