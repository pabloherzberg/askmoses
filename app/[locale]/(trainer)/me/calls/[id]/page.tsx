export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getCallById } from '@/lib/services/calls'
import { getScripts, formatScriptVersion } from '@/lib/services/scripts'
import { getIntentSignals } from '@/lib/services/intent'
import { dbGetActiveOrgScriptId } from '@/lib/db/scripts'
import { getOrgId, getTrainerDbId } from '@/lib/auth'
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

  const orgId = await getOrgId()
  const [call, scripts, activeScriptId, intentSignals] = await Promise.all([
    getCallById(id, { locale, trainerId }),
    getScripts().catch(() => []),
    // Helper leve (só id) — basta o id pra comparar com call.scriptId.
    orgId ? dbGetActiveOrgScriptId(orgId).catch(() => null) : Promise.resolve(null),
    getIntentSignals().catch(() => []),
  ])
  if (!call) notFound()

  // scriptIsActive baseado em org_scripts (status='active' AND ended_at IS
  // NULL), não no scripts.is_active legado — alinha com a página de listagem.
  const script = call.scriptId ? scripts.find((s) => s.id === call.scriptId) : undefined
  const enrichedCall = {
    ...call,
    scriptName: script?.name ?? null,
    scriptIsActive: !!(call.scriptId && activeScriptId && call.scriptId === activeScriptId),
    scriptVersion: formatScriptVersion(script),
  }

  return <CallDetail call={enrichedCall} viewerRole="trainer" backHref="/me" intentSignals={intentSignals} />
}
