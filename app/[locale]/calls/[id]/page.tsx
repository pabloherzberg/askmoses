export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getCallById } from '@/lib/services/calls'
import { getScripts, formatScriptVersion } from '@/lib/services/scripts'
import { dbGetActiveOrgScript } from '@/lib/db/scripts'
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

  const detailOrgId = scope.orgId ?? (await getOrgId())
  const [call, scripts, activeOrgScript] = await Promise.all([
    getCallById(id, { locale, ...scope }),
    getScripts().catch(() => []),
    detailOrgId ? dbGetActiveOrgScript(detailOrgId).catch(() => null) : Promise.resolve(null),
  ])
  if (!call) notFound()

  // Enrich call with scriptName/scriptIsActive/scriptVersion. scriptIsActive
  // vem do org_scripts (status='active' AND ended_at IS NULL), não do
  // scripts.is_active legado.
  const script = call.scriptId ? scripts.find((s) => s.id === call.scriptId) : undefined
  const activeId = activeOrgScript?.id ?? null
  const enrichedCall = {
    ...call,
    scriptName: script?.name ?? null,
    scriptIsActive: !!(call.scriptId && activeId && call.scriptId === activeId),
    scriptVersion: formatScriptVersion(script),
  }

  return <CallDetail call={enrichedCall} viewerRole={role ?? 'owner'} backHref="/calls" />
}
