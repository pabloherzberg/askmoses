import { notFound } from 'next/navigation'
import { getCallById } from '@/lib/services/calls'
import { getUserId } from '@/lib/auth'
import { CallDetail } from '@/components/shared/CallDetail'

// Demo: trainer@demo.askmoses.ai is Marcus R.
const DEMO_TRAINER_ID = 'trainer-marcus'

interface Props {
  params: Promise<{ id: string }>
}

export default async function TrainerCallDetailPage({ params }: Props) {
  const { id } = await params
  const [call, userId] = await Promise.all([getCallById(id), getUserId()])

  if (!call) notFound()

  // Map demo user ID to actual trainer record ID
  const effectiveTrainerId = userId === 'demo-trainer' ? DEMO_TRAINER_ID : (userId ?? '')

  if (call.trainerId !== effectiveTrainerId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-2xl font-semibold" style={{ color: 'var(--am-red)' }}>403</p>
        <p className="text-sm" style={{ color: 'var(--am-muted)' }}>
          You don&apos;t have access to this call.
        </p>
      </div>
    )
  }

  return <CallDetail call={call} viewerRole="trainer" backHref="/me" />
}
