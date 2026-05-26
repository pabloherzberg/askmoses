export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getCallById } from '@/lib/services/calls'
import { getScripts, formatScriptVersion } from '@/lib/services/scripts'
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

  const [call, scripts] = await Promise.all([
    getCallById(id, { locale, ...scope }),
    getScripts().catch(() => []),
  ])
  if (!call) notFound()

  // Enrich call with scriptName/scriptIsActive/scriptVersion (toCall mapper
  // só preenche scriptId — nome/ativo/versão são resolvidos aqui a partir
  // da lista de scripts da org, igual à página /calls).
  const script = call.scriptId ? scripts.find((s) => s.id === call.scriptId) : undefined
  const enrichedCall = {
    ...call,
    scriptName: script?.name ?? null,
    scriptIsActive: script?.is_active ?? false,
    scriptVersion: formatScriptVersion(script),
  }

  return <CallDetail call={enrichedCall} viewerRole={role ?? 'owner'} backHref="/calls" />
}
