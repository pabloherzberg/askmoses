export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { getCalls } from '@/lib/services/calls'
import { getScripts } from '@/lib/services/scripts'
import { dbGetActiveOrgScript } from '@/lib/db/scripts'
import { getOrgId, getTrainerDbId } from '@/lib/auth'
import type { Call } from '@/lib/types'
import { CallsTable } from '@/app/[locale]/calls/CallsTable'

// ─── Fallback de demo ────────────────────────────────────────────────────
// Mesmo fallback usado em /calls — enquanto a migration 056 (calls.script_id)
// não estiver aplicada, atribuímos um script determinístico por data para que
// a coluna "Script" continue demonstrável. Quando o DB já tem script_id real,
// o fallback é ignorado.
const DEMO_ACTIVE_SCRIPT = { id: 'demo-script-discovery', name: 'Discovery-First Sales Script' }
const DEMO_LEGACY_SCRIPT = { id: 'demo-script-objection', name: 'Objection Handling Script' }
const DEMO_SCRIPT_CUTOFF = '2026-04-07'

function demoScriptForCall(call: Call): Pick<Call, 'scriptId' | 'scriptName' | 'scriptIsActive'> {
  const isCurrent = call.date >= DEMO_SCRIPT_CUTOFF
  const script = isCurrent ? DEMO_ACTIVE_SCRIPT : DEMO_LEGACY_SCRIPT
  return { scriptId: script.id, scriptName: script.name, scriptIsActive: isCurrent }
}

export default async function TrainerCallsPage() {
  const [trainerId, t] = await Promise.all([
    getTrainerDbId(),
    getTranslations('Owner.calls'),
  ])

  if (!trainerId) {
    return (
      <div>
        <CallsTable
          calls={[]}
          showTrainerColumn={false}
            sectionLabel={t('myCallsLabel')}
          title={t('myCalls')}
        />
      </div>
    )
  }

  const orgId = await getOrgId()
  const [calls, scripts, activeOrgScript] = await Promise.all([
    getCalls({ trainerId }),
    getScripts().catch(() => []),
    // Mesma lógica da /calls do Owner — fonte da verdade é org_scripts
    // (status='active' AND ended_at IS NULL), não scripts.is_active legado.
    // Sem isso o trainer não via a pill verde, e podia ver scripts pending
    // marcados como ativos.
    orgId ? dbGetActiveOrgScript(orgId).catch(() => null) : Promise.resolve(null),
  ])

  const dbHasScripts = calls.some((c) => c.scriptId)
  const scriptMap = new Map(scripts.map((s) => [s.id, s]))
  const activeId = activeOrgScript?.id ?? null

  const enrichedCalls: Call[] = calls.map((c) => {
    if (dbHasScripts) {
      const script = c.scriptId ? scriptMap.get(c.scriptId) : undefined
      return {
        ...c,
        scriptName: script?.name ?? null,
        scriptIsActive: !!(c.scriptId && activeId && c.scriptId === activeId),
      }
    }
    return { ...c, ...demoScriptForCall(c) }
  })

  return (
    <div>
      <CallsTable
        calls={enrichedCalls}
        showTrainerColumn={false}
        sectionLabel={t('myCallsLabel')}
        title={t('myCalls')}
      />
    </div>
  )
}
