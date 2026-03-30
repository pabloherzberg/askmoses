'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Phone } from 'lucide-react'
import { ScorePill } from '@/components/shared/ScorePill'
import type { Call, Trainer, CallResult } from '@/lib/types'

const avatarBgMap: Record<string, string> = {
  blue: 'var(--am-blue-bg)',
  purple: 'rgba(110,86,255,0.15)',
  green: 'var(--am-green-bg)',
  red: 'var(--am-red-bg)',
}
const avatarTextMap: Record<string, string> = {
  blue: 'var(--am-blue)',
  purple: 'var(--am-accent2)',
  green: 'var(--am-green)',
  red: 'var(--am-red)',
}
const resultStyles: Record<CallResult, { bg: string; color: string; label: string }> = {
  closed: { bg: 'var(--am-green-bg)', color: 'var(--am-green)', label: 'Closed' },
  'no-close': { bg: 'var(--am-red-bg)', color: 'var(--am-red)', label: 'No Close' },
  'follow-up': { bg: 'var(--am-amber-bg)', color: 'var(--am-amber)', label: 'Follow-up' },
}

interface CallsTableProps {
  calls: Call[]
  trainers: Trainer[]
}

export function CallsTable({ calls, trainers }: CallsTableProps) {
  const router = useRouter()
  const [trainerFilter, setTrainerFilter] = useState<string>('all')
  const [resultFilter, setResultFilter] = useState<string>('all')

  const trainerMap = useMemo(
    () => Object.fromEntries(trainers.map((t) => [t.id, t])),
    [trainers]
  )

  const filtered = useMemo(() => {
    return calls.filter((c) => {
      if (trainerFilter !== 'all' && c.trainerId !== trainerFilter) return false
      if (resultFilter !== 'all' && c.result !== resultFilter) return false
      return true
    })
  }, [calls, trainerFilter, resultFilter])

  const selectClass =
    'text-sm rounded-lg px-3 py-1.5 border outline-none transition-colors cursor-pointer'
  const selectStyle = {
    background: 'var(--card)',
    borderColor: 'var(--am-border2)',
    color: 'var(--am-text)',
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          className={selectClass}
          style={selectStyle}
          value={trainerFilter}
          onChange={(e) => setTrainerFilter(e.target.value)}
        >
          <option value="all">All Trainers</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <select
          className={selectClass}
          style={selectStyle}
          value={resultFilter}
          onChange={(e) => setResultFilter(e.target.value)}
        >
          <option value="all">All Results</option>
          <option value="closed">Closed</option>
          <option value="no-close">No Close</option>
          <option value="follow-up">Follow-up</option>
        </select>

        <span className="ml-auto text-xs self-center" style={{ color: 'var(--am-muted)' }}>
          {filtered.length} {filtered.length === 1 ? 'call' : 'calls'}
        </span>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Phone size={32} style={{ color: 'var(--am-muted)', opacity: 0.4 }} />
            <p className="text-sm" style={{ color: 'var(--am-muted)' }}>
              No calls found for the selected filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
                  {['Trainer', 'Prospect', 'Date', 'Duration', 'Score', 'Result', ''].map((h) => (
                    <th
                      key={h}
                      className="text-[11px] font-medium text-left px-4 py-3"
                      style={{ color: 'var(--am-muted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((call) => {
                  const trainer = trainerMap[call.trainerId]
                  const result = resultStyles[call.result]
                  return (
                    <tr
                      key={call.id}
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: '1px solid var(--am-border)' }}
                      onClick={() => router.push(`/calls/${call.id}`)}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'var(--am-bg3)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = 'transparent')
                      }
                    >
                      {/* Trainer */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {trainer && (
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold font-mono flex-shrink-0"
                              style={{
                                background: avatarBgMap[trainer.avatarColor],
                                color: avatarTextMap[trainer.avatarColor],
                              }}
                            >
                              {trainer.avatar}
                            </div>
                          )}
                          <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: 'var(--am-text)' }}>
                            {call.trainerName}
                          </span>
                        </div>
                      </td>

                      {/* Prospect */}
                      <td className="px-4 py-3">
                        <span className="text-[13px]" style={{ color: 'var(--am-text)' }}>
                          {call.prospect}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-mono" style={{ color: 'var(--am-muted)' }}>
                          {new Date(call.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </td>

                      {/* Duration */}
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono" style={{ color: 'var(--am-muted)' }}>
                          {call.duration}
                        </span>
                      </td>

                      {/* Score */}
                      <td className="px-4 py-3">
                        <ScorePill score={call.score} />
                      </td>

                      {/* Result */}
                      <td className="px-4 py-3">
                        <span
                          className="text-[11px] font-medium px-2 py-0.5 rounded-full font-mono"
                          style={{ background: result.bg, color: result.color }}
                        >
                          {result.label}
                        </span>
                      </td>

                      {/* Arrow */}
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
