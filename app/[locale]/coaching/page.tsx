import { SectionLabel } from '@/components/shared/SectionLabel'
import { TrainerTabs } from '@/components/shared/TrainerTabs'

export default function CoachingPage() {
  return (
    <div>
      <SectionLabel>Coaching Center</SectionLabel>
      <p className="text-sm mb-6" style={{ color: 'var(--am-muted)' }}>
        Best calls of the week — use these as reference material in team training sessions.
      </p>
      <TrainerTabs />
    </div>
  )
}
