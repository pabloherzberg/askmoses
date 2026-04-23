export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCallById } from '@/lib/services/calls'
import { getRole, getTrainerDbId } from '@/lib/auth'
import { CallDetail } from '@/components/shared/CallDetail'

interface Props {
  params: Promise<{ id: string }>
}

export default async function CallDetailPage({ params }: Props) {
  const { id } = await params
  const [call, role] = await Promise.all([getCallById(id), getRole()])

  if (!call) notFound()

  // Trainer can only view their own calls
  if (role === 'trainer') {
    const trainerId = await getTrainerDbId()
    if (!trainerId || call.trainerId !== trainerId) {
      const t = await getTranslations('Owner.calls')
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <p className="text-2xl font-semibold" style={{ color: 'var(--am-red)' }}>403</p>
          <p className="text-sm" style={{ color: 'var(--am-muted)' }}>{t('forbidden')}</p>
        </div>
      )
    }
  }

  return <CallDetail call={call} viewerRole={role ?? 'owner'} backHref="/calls" />
}
