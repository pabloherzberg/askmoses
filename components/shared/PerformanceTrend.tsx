'use client'

import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { PerformanceTrendPoint } from '@/lib/types'

interface SalesPerson {
  id: string
  name: string
}

interface PerformanceTrendProps {
  trends: Record<string, PerformanceTrendPoint[]>
  // owner view: pass list of sales people → shows pill selector
  salesPeople?: SalesPerson[]
  // trainer view: pass fixed id → no selector shown
  fixedId?: string
}

export function PerformanceTrend({ trends, salesPeople, fixedId }: PerformanceTrendProps) {
  const [selected, setSelected] = useState<string>('team')

  const activeId = fixedId ?? selected
  const data = trends[activeId] ?? []

  const activeLabel = fixedId
    ? (salesPeople?.find((s) => s.id === fixedId)?.name ?? 'My Trend')
    : selected === 'team'
    ? null
    : salesPeople?.find((s) => s.id === selected)?.name ?? null

  return (
    <div
      className="rounded-2xl p-5 border shadow-md mb-4"
      style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-4 flex-wrap">
        <div>
          <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
            Overall Performance Trend
            {activeLabel && (
              <span className="ml-2 font-normal" style={{ color: 'var(--am-muted)' }}>
                — {activeLabel}
              </span>
            )}
          </p>
        </div>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded flex-shrink-0"
          style={{ background: 'var(--am-amber-bg)', color: 'var(--am-amber)' }}
        >
          mock data only
        </span>
      </div>

      {/* Pill selector — owner view only */}
      {!fixedId && salesPeople && salesPeople.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setSelected('team')}
            className="text-[11px] font-medium px-3 py-1 rounded-full transition-colors"
            style={{
              background: selected === 'team' ? 'var(--am-accent)' : 'var(--am-bg3)',
              color: selected === 'team' ? '#fff' : 'var(--am-muted)',
            }}
          >
            Team
          </button>
          {salesPeople.map((sp) => (
            <button
              key={sp.id}
              onClick={() => setSelected(sp.id)}
              className="text-[11px] font-medium px-3 py-1 rounded-full transition-colors"
              style={{
                background: selected === sp.id ? 'var(--am-accent)' : 'var(--am-bg3)',
                color: selected === sp.id ? '#fff' : 'var(--am-muted)',
              }}
            >
              {sp.name}
            </button>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 mb-3">
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--am-muted)' }}>
          <span className="inline-block w-5 h-0.5 rounded" style={{ background: 'var(--am-green)' }} />
          Close Rate %
        </span>
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--am-muted)' }}>
          <svg width="20" height="2" className="inline-block">
            <line x1="0" y1="1" x2="20" y2="1" stroke="var(--am-blue)" strokeWidth="2" strokeDasharray="4 2" />
          </svg>
          Avg Score
        </span>
      </div>

      {/* Chart */}
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="week"
              tick={{ fill: 'var(--am-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[40, 100]}
              tick={{ fill: 'var(--am-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--am-bg3)',
                border: '1px solid var(--am-border)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--am-text)',
              }}
              labelStyle={{ color: 'var(--am-muted)', fontSize: 11 }}
              formatter={(value: number, name: string) =>
                name === 'closeRate' ? [`${value}%`, 'Close Rate'] : [value, 'Avg Score']
              }
            />
            <Line
              type="monotone"
              dataKey="closeRate"
              name="closeRate"
              stroke="var(--am-green)"
              strokeWidth={2}
              dot={{ r: 4, fill: 'var(--am-green)' }}
              activeDot={{ r: 5 }}
              label={{ position: 'top', fontSize: 10, fill: 'var(--am-green)', formatter: (v: number) => `${v}%` }}
            />
            <Line
              type="monotone"
              dataKey="avgScore"
              name="avgScore"
              stroke="var(--am-blue)"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={{ r: 4, fill: 'var(--am-blue)' }}
              activeDot={{ r: 5 }}
              label={{ position: 'top', fontSize: 10, fill: 'var(--am-blue)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <p className="text-[10px] mt-2" style={{ color: 'var(--am-amber)' }}>
        ↑ values sourced from mock-data.ts · Recharts LineChart · no real calculation
      </p>
    </div>
  )
}
