export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCallById } from '@/lib/services/calls'
import { getTrainerDbId } from '@/lib/auth'
import { CallDetail } from '@/components/shared/CallDetail'

interface Props {
  params: Promise<{ id: string }>
}

export default async function TrainerCallDetailPage({ params }: Props) {
  const { id } = await params
  const [call, trainerId] = await Promise.all([getCallById(id), getTrainerDbId()])

  if (!call) notFound()

  if (!trainerId || call.trainerId !== trainerId) {
    const t = await getTranslations('Trainer')
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-2xl font-semibold" style={{ color: 'var(--am-red)' }}>403</p>
        <p className="text-sm" style={{ color: 'var(--am-muted)' }}>
          {t('forbidden')}
        </p>
      </div>
    )
  }

  return <CallDetail call={call} viewerRole="trainer" backHref="/me" />
}
