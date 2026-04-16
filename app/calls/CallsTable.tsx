'use client'

import { useState, useMemo } from 'react'
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
    ...(showTrainerColumn ? ['Trainer'] : []),
    'Prospect', 'Date', 'Score', 'Result', '',
  ]

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5">
        <select className={selectClass} style={selectStyle} value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
          <option value="all">All Results</option>
          {CALL_OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {showTrainerColumn && trainers.length > 0 && (
          <select className={selectClass} style={selectStyle} value={trainerFilter} onChange={(e) => setTrainerFilter(e.target.value)}>
            <option value="all">All Sales People</option>
            {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <span className="ml-auto text-xs self-center" style={{ color: 'var(--am-muted)' }}>
          {filtered.length} {filtered.length === 1 ? 'call' : 'calls'}
        </span>
      </div>

      <div className="rounded-2xl border overflow-hidden shadow-md" style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Phone size={32} style={{ color: 'var(--am-muted)', opacity: 0.4 }} />
            <p className="text-sm" style={{ color: 'var(--am-muted)' }}>No calls found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
                  {headers.map((h) => (
                    <th key={h} className="text-[11px] font-medium text-left px-4 py-3" style={{ color: 'var(--am-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((call) => {
                  const result = RESULT_STYLES[call.result] ?? DEFAULT_RESULT_STYLE
                  return (
                    <tr
                      key={call.id}
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: '1px solid var(--am-border)' }}
                      onClick={() => router.push(`/calls/${call.id}`)}
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
                          {new Date(call.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </td>
                      <td className="px-4 py-3"><ScorePill score={call.score} /></td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full font-mono" style={{ background: result.bg, color: result.color }}>
                          {result.label}
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
