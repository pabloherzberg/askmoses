'use client'

import { useState, useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ChevronRight, Phone } from 'lucide-react'
import { ScorePill } from '@/components/shared/ScorePill'
import { RESULT_STYLES, DEFAULT_RESULT_STYLE, CALL_OUTCOMES } from '@/lib/constants'
import type { Call } from '@/lib/types'

interface CallsTableProps {
  calls: Call[]
  showTrainerColumn?: boolean
}

export function CallsTable({ calls, showTrainerColumn = true }: CallsTableProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('Owner.calls')
  const tOutcomes = useTranslations('Shared.outcomes')
  const [resultFilter, setResultFilter] = useState<string>('all')
  const [trainerFilter, setTrainerFilter] = useState<string>('all')

  const trainers = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of calls) {
      if (c.trainerId) map.set(c.trainerId, c.trainerName)
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [calls])

  const filtered = useMemo(
    () => calls.filter((c) => {
      if (resultFilter !== 'all' && c.result !== resultFilter) return false
      if (trainerFilter !== 'all' && c.trainerId !== trainerFilter) return false
      return true
    }),
    [calls, resultFilter, trainerFilter]
  )

  const selectClass = 'text-sm rounded-lg px-3 py-1.5 border outline-none transition-colors cursor-pointer'
  const selectStyle = { background: 'var(--card)', borderColor: 'var(--am-border2)', color: 'var(--am-text)' }

  const headers = [
    ...(showTrainerColumn ? [t('thTrainer')] : []),
    t('thProspect'), t('thDate'), t('thScore'), t('thResult'), '',
  ]

  const countLabel = filtered.length === 1
    ? t('callsAnalyzedOne', { count: filtered.length })
    : t('callsAnalyzedOther', { count: filtered.length })

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5">
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
        <span className="ml-auto text-xs self-center" style={{ color: 'var(--am-muted)' }}>
          {countLabel}
        </span>
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
                        <span className="text-[13px]" style={{ color: 'var(--am-text)' }}>{call.prospect}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-mono" style={{ color: 'var(--am-muted)' }}>
                          {new Date(call.date).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </td>
                      <td className="px-4 py-3"><ScorePill score={call.score} /></td>
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
