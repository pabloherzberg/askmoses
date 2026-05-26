export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getCallById } from '@/lib/services/calls'
import { getScripts } from '@/lib/services/scripts'
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

  const [call, scripts] = await Promise.all([
    getCallById(id, { locale, trainerId }),
    getScripts().catch(() => []),
  ])
  if (!call) notFound()

  // Enriquecer com nome/active do script — toCall só carrega scriptId.
  const script = call.scriptId ? scripts.find((s) => s.id === call.scriptId) : undefined
  const enrichedCall = {
    ...call,
    scriptName: script?.name ?? null,
    scriptIsActive: script?.is_active ?? false,
  }

  return <CallDetail call={enrichedCall} viewerRole="trainer" backHref="/me" />
}
