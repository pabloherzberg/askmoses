export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getCallById } from '@/lib/services/calls'
import { getTrainerDbId } from '@/lib/auth'
import { CallDetail } from '@/components/shared/CallDetail'
import type { Locale } from '@/i18n/routing'

interface Props {
  params: Promise<{ id: string }>
}

export default async function TrainerCallDetailPage({ params }: Props) {
  const { id } = await params
  const locale = (await getLocale()) as Locale
  const trainerId = await getTrainerDbId()
  if (!trainerId) notFound()

  const call = await getCallById(id, { locale, trainerId })
  if (!call) notFound()

  return <CallDetail call={call} viewerRole="trainer" backHref="/me" />
}
