'use client'

import { useState, useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ChevronRight, Phone, FileText } from 'lucide-react'
import { ScorePill } from '@/components/shared/ScorePill'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { RESULT_STYLES, DEFAULT_RESULT_STYLE, CALL_OUTCOMES, LEAD_SOURCE_LABELS } from '@/lib/constants'
import type { Call } from '@/lib/types'

interface CallsTableProps {
  calls: Call[]
  showTrainerColumn?: boolean
  /**
   * @deprecated não tem mais efeito. Filtro de Sources foi removido (sem
   * funcionalidade real); filtro de Script e pill de "active script" agora
   * dependem apenas dos dados (`hasScripts`). Mantido na assinatura pra
   * compat com callers existentes — pode ser removido em refactor futuro.
   */
  showAdvancedFilters?: boolean
  sectionLabel: string
  title: string
}

const GREEN_BG = 'var(--am-green-bg, rgba(34,217,160,0.12))'

export function CallsTable({
  calls,
  showTrainerColumn = true,
  sectionLabel,
  title,
}: CallsTableProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('Owner.calls')
  const tOutcomes = useTranslations('Shared.outcomes')
  const [resultFilter, setResultFilter] = useState<string>('all')
  const [trainerFilter, setTrainerFilter] = useState<string>('all')
  // Source filter removido da UI (sem funcionalidade real ainda).
  // const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [scriptFilter, setScriptFilter] = useState<string>('all')

  const trainers = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of calls) {
      if (c.trainerId) map.set(c.trainerId, c.trainerName)
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [calls])

  // Scripts efetivamente usados pelas calls visíveis — fonte tanto do filtro
  // quanto da tag de script ativo. Calls sem script (rubric) são ignoradas.
  const scriptsInCalls = useMemo(() => {
    const map = new Map<string, { id: string; name: string; isActive: boolean }>()
    for (const c of calls) {
      if (c.scriptId && c.scriptName && !map.has(c.scriptId)) {
        map.set(c.scriptId, { id: c.scriptId, name: c.scriptName, isActive: !!c.scriptIsActive })
      }
    }
    return Array.from(map.values())
  }, [calls])

  const hasScripts = scriptsInCalls.length > 0
  const activeScript = scriptsInCalls.find((s) => s.isActive) ?? null

  const filtered = useMemo(
    () => calls.filter((c) => {
      if (resultFilter !== 'all' && c.result !== resultFilter) return false
      if (trainerFilter !== 'all' && c.trainerId !== trainerFilter) return false
      if (scriptFilter !== 'all' && (c.scriptId ?? null) !== scriptFilter) return false
      return true
    }),
    [calls, resultFilter, trainerFilter, scriptFilter]
  )

  const selectClass = 'text-sm rounded-lg px-3 py-1.5 border outline-none transition-colors cursor-pointer'
  const selectStyle = { background: 'var(--card)', borderColor: 'var(--am-border2)', color: 'var(--am-text)' }

  const headers = [
    ...(showTrainerColumn ? [t('thTrainer')] : []),
    t('thProspect'), t('thDate'),
    ...(hasScripts ? [t('thScript')] : []),
    t('thScore'), t('thDuration'), t('thResult'), '',
  ]

  const countLabel = filtered.length === 1
    ? t('callsAnalyzedOne', { count: filtered.length })
    : t('callsAnalyzedOther', { count: filtered.length })

  return (
    <div>
      <div className="mb-6">
        <SectionLabel>{sectionLabel}</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {title}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--am-muted)' }}>
          {countLabel}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select className={selectClass} style={selectStyle} value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
          <option value="all">{tOutcomes('all')}</option>
          {CALL_OUTCOMES.map((o) => (
            <option key={o.value} value={o.value}>{tOutcomes(`full.${o.value}`)}</option>
          ))}
        </select>
        {showTrainerColumn && trainers.length > 0 && (
          <select className={selectClass} style={selectStyle} value={trainerFilter} onChange={(e) => setTrainerFilter(e.target.value)}>
            <option value="all">{t('filterAllSalesPeople')}</option>
            {trainers.map((tr) => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
          </select>
        )}
        {/* Filtro de Sources removido — sem funcionalidade real por trás.
            Reabilitar quando lead_source for editável e tiver consumidores. */}
        {hasScripts && (
          <select className={selectClass} style={selectStyle} value={scriptFilter} onChange={(e) => setScriptFilter(e.target.value)}>
            <option value="all">{t('filterAllScripts')}</option>
            {scriptsInCalls.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        {activeScript && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg sm:ml-auto"
            style={{ background: GREEN_BG, color: 'var(--am-green)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--am-green)' }} />
            {t('activeScriptTag', { name: activeScript.name })}
          </span>
        )}
      </div>

      <div className="rounded-2xl border overflow-hidden shadow-md" style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Phone size={32} style={{ color: 'var(--am-muted)', opacity: 0.4 }} />
            <p className="text-sm" style={{ color: 'var(--am-muted)' }}>{t('noCallsFound')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
                  {headers.map((h, i) => (
                    <th key={i} className="text-[11px] font-medium text-left px-4 py-3" style={{ color: 'var(--am-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((call) => {
                  const result = RESULT_STYLES[call.result] ?? DEFAULT_RESULT_STYLE
                  const outcomeLabel = call.result in RESULT_STYLES
                    ? tOutcomes(`short.${call.result}`)
                    : tOutcomes('unknown')
                  return (
                    <tr
                      key={call.id}
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: '1px solid var(--am-border)' }}
                      onClick={() => router.push(`/${locale}/calls/${call.id}`)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--am-bg3)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {showTrainerColumn && (
                        <td className="px-4 py-3">
                          <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: 'var(--am-text)' }}>
                            {call.trainerName}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px]" style={{ color: 'var(--am-text)' }}>{call.prospect}</span>
                          {call.lead_source && (
                            <span
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--am-bg4)', color: 'var(--am-accent2)' }}
                            >
                              {LEAD_SOURCE_LABELS[call.lead_source]}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-mono" style={{ color: 'var(--am-muted)' }}>
                          {new Date(call.date).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </td>
                      {hasScripts && (
                        <td className="px-4 py-3">
                          {call.scriptName ? (
                            <span
                              className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                              style={
                                call.scriptIsActive
                                  ? { background: GREEN_BG, color: 'var(--am-green)' }
                                  : { background: 'var(--am-bg4)', color: 'var(--am-muted)' }
                              }
                            >
                              <FileText size={11} />
                              {call.scriptName}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--am-muted)' }}>—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3"><ScorePill score={call.score} /></td>
                      {/* Duração em minutos — Owner vê apenas a quantidade, nunca
                          o custo (cobrança por minuto é visível só pro Admin). */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-[13px] font-mono" style={{ color: 'var(--am-muted)' }}>
                          {t('durationMinutes', { count: call.durationMinutes })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full font-mono" style={{ background: result.bg, color: result.color }}>
                          {outcomeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight size={16} style={{ color: 'var(--am-muted)' }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
