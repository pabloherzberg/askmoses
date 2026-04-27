export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getCallById } from '@/lib/services/calls'
import { getRole, getOrgId, getTrainerDbId } from '@/lib/auth'
import { CallDetail } from '@/components/shared/CallDetail'
import type { Locale } from '@/i18n/routing'

interface Props {
  params: Promise<{ id: string }>
}

export default async function CallDetailPage({ params }: Props) {
  const { id } = await params
  const locale = (await getLocale()) as Locale
  const role = await getRole()

  // Scope: trainer → own calls only; owner/admin → calls in own org.
  // Anything outside the scope 404s (don't reveal existence).
  let scope: { orgId?: string; trainerId?: string } = {}
  if (role === 'trainer') {
    const trainerId = await getTrainerDbId()
    if (!trainerId) notFound()
    scope = { trainerId }
  } else {
    const orgId = await getOrgId()
    if (!orgId) notFound()
    scope = { orgId }
  }

  const call = await getCallById(id, { locale, ...scope })
  if (!call) notFound()

  return <CallDetail call={call} viewerRole={role ?? 'owner'} backHref="/calls" />
}
