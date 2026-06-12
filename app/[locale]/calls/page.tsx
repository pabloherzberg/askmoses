export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { getCalls } from '@/lib/services/calls'
import { getScripts } from '@/lib/services/scripts'
import { dbGetActiveOrgScriptId } from '@/lib/db/scripts'
import { getRole, getOrgId, getTrainerDbId } from '@/lib/auth'
import type { Call } from '@/lib/types'
import { CallsTable } from './CallsTable'

// ─── Fallback de demo ────────────────────────────────────────────────────
// Enquanto a migration 056 (calls.script_id) não estiver aplicada no banco,
// nenhuma call tem script — o filtro e a tag de script ativo ficariam
// invisíveis. Pra a feature ser sempre demonstrável, atribuímos um script
// determinístico por data da call. Quando a migration roda e as calls têm
// script_id real, esse fallback é ignorado (ver `dbHasScripts` abaixo).
const DEMO_ACTIVE_SCRIPT = { id: 'demo-script-discovery', name: 'Discovery-First Sales Script' }
const DEMO_LEGACY_SCRIPT = { id: 'demo-script-objection', name: 'Objection Handling Script' }
// Calls a partir desta data usaram o script atual; anteriores, o legado.
const DEMO_SCRIPT_CUTOFF = '2026-04-07'

function demoScriptForCall(call: Call): Pick<Call, 'scriptId' | 'scriptName' | 'scriptIsActive'> {
  // call.date é um ISO timestamp — comparação lexicográfica funciona.
  const isCurrent = call.date >= DEMO_SCRIPT_CUTOFF
  const script = isCurrent ? DEMO_ACTIVE_SCRIPT : DEMO_LEGACY_SCRIPT
  return { scriptId: script.id, scriptName: script.name, scriptIsActive: isCurrent }
}

export default async function CallsPage() {
  const [role, t] = await Promise.all([getRole(), getTranslations('Owner.calls')])
  const isTrainer = role === 'trainer'
  const trainerId = isTrainer ? await getTrainerDbId() : undefined
  const orgId = await getOrgId()

  // Scripts são resolvidos por org separadamente das calls. `.catch` degrada
  // de forma graciosa caso a query de scripts falhe.
  // `activeScriptId` é a fonte da verdade do "script atual" — vem de
  // org_scripts.status='active' AND ended_at IS NULL (não confunde com
  // scripts.is_active, que é legado e pode estar dessincronizado, marcando
  // como ativo um script que na verdade está pending pelo fluxo Admin).
  // Usa o helper leve (só busca o id) — esta página não precisa do payload
  // completo do script (sections, full_script, criteria).
  const [calls, scripts, activeScriptId] = await Promise.all([
    getCalls(trainerId ? { trainerId } : undefined),
    getScripts().catch(() => []),
    orgId ? dbGetActiveOrgScriptId(orgId).catch(() => null) : Promise.resolve(null),
  ])

  // Migration 056 aplicada? Sim se ao menos uma call traz script_id do banco.
  const dbHasScripts = calls.some((c) => c.scriptId)
  const scriptMap = new Map(scripts.map((s) => [s.id, s]))
  const activeId = activeScriptId

  const enrichedCalls: Call[] = calls.map((c) => {
    if (dbHasScripts) {
      // Dados reais: resolve nome a partir dos scripts da org. Ativo SÓ se
      // for o script que está em org_scripts como active aberto — não
      // confunde com scripts.is_active legado.
      const script = c.scriptId ? scriptMap.get(c.scriptId) : undefined
      return {
        ...c,
        scriptName: script?.name ?? null,
        scriptIsActive: !!(c.scriptId && activeId && c.scriptId === activeId),
      }
    }
    // Fallback de demo enquanto a migration não roda.
    return { ...c, ...demoScriptForCall(c) }
  })

  return (
    <div>
      <CallsTable
        calls={enrichedCalls}
        showTrainerColumn={!isTrainer}
        sectionLabel={isTrainer ? t('myCallsLabel') : t('teamCallsLabel')}
        title={isTrainer ? t('myCalls') : t('allCalls')}
        canReprocess={role === 'admin'}
      />
    </div>
  )
}
