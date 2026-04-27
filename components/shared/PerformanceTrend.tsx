'use client'

import { useState } from 'react'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts'
import type { PerformanceTrendPoint } from '@/lib/types'

interface SalesPerson {
  id: string
  name: string
}

interface PerformanceTrendProps {
  trends: Record<string, PerformanceTrendPoint[]>
  salesPeople?: SalesPerson[]
  fixedId?: string
  chartHeight?: number
}

type TimeRange = '6w' | '3m' | '6m'

function sliceByRange(data: PerformanceTrendPoint[], range: TimeRange): PerformanceTrendPoint[] {
  if (range === '6w') return data.slice(-6)
  if (range === '3m') return data.slice(-12)
  return data
}

function labelWeek(w: string) {
  const num = parseInt(w.replace(/\D/g, ''), 10)
  if (!isNaN(num)) return `Week ${num}`
  return w
}

export function PerformanceTrend({ trends, salesPeople, fixedId, chartHeight = 200 }: PerformanceTrendProps) {
  const [selected, setSelected] = useState<string>('team')
  const [range, setRange] = useState<TimeRange>('6w')

  const activeId = fixedId ?? selected
  const rawData = trends[activeId] ?? []
  const data = sliceByRange(rawData, range).map((d) => ({
    ...d,
    weekLabel: labelWeek(d.week),
  }))

  const trainerName = fixedId
    ? (salesPeople?.find((s) => s.id === fixedId)?.name ?? null)
    : selected === 'team'
    ? null
    : salesPeople?.find((s) => s.id === selected)?.name ?? null

  // Team avg data for overlay (only in fixedId mode — show trainer vs team)
  const teamData = sliceByRange(trends['team'] ?? [], range).map((d) => ({
    ...d,
    weekLabel: labelWeek(d.week),
  }))

  // Merge trainer data with team avg into single series for chart
  const merged = data.map((d, i) => ({
    ...d,
    teamCloseRate: teamData[i]?.closeRate ?? null,
  }))

  const lastTrainer = data[data.length - 1]?.closeRate
  const lastTeam = teamData[teamData.length - 1]?.closeRate

  return (
    <div
      className="rounded-2xl p-5 border shadow-md mb-4"
      style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <p
          className="text-[11px] font-semibold tracking-widest uppercase"
          style={{ color: 'var(--am-muted)' }}
        >
          Conversion Rate Trend
        </p>

        {/* Time range pills */}
        <div className="flex items-center gap-1">
          {(['6w', '3m', '6m'] as TimeRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className="text-[11px] font-semibold px-3 py-1 rounded-full border transition-colors"
              style={
                range === r
                  ? {
                      background: 'var(--am-green)',
                      color: '#fff',
                      borderColor: 'var(--am-green)',
                    }
                  : {
                      background: 'transparent',
                      color: 'var(--am-muted)',
                      borderColor: 'var(--am-border)',
                    }
              }
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Pill selector — owner view only (no fixedId) */}
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

      {/* Chart */}
      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={merged} margin={{ top: 16, right: 40, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="trainerFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--am-green)" stopOpacity={0.18} />
                <stop offset="95%" stopColor="var(--am-green)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="weekLabel"
              tick={{ fill: 'var(--am-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[50, 'auto']}
              tick={{ fill: 'var(--am-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
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
              formatter={(value: number, name: string) => {
                if (name === 'closeRate') return [`${value}%`, trainerName ?? 'Close Rate']
                if (name === 'teamCloseRate') return [`${value}%`, 'Team avg']
                return [`${value}`, name]
              }}
            />

            {/* Team avg — dashed gray */}
            <Area
              type="monotone"
              dataKey="teamCloseRate"
              name="teamCloseRate"
              stroke="var(--am-muted)"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              fill="none"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--am-muted)' }}
            />

            {/* Trainer — solid green with fill */}
            <Area
              type="monotone"
              dataKey="closeRate"
              name="closeRate"
              stroke="var(--am-green)"
              strokeWidth={2.5}
              fill="url(#trainerFill)"
              dot={{ r: 4, fill: 'var(--am-green)', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* End-of-line value annotations */}
      <div className="flex justify-end gap-4 -mt-1 mb-3 pr-1">
        {lastTrainer != null && (
          <span className="text-[11px] font-mono font-semibold" style={{ color: 'var(--am-green)' }}>
            {lastTrainer}%
          </span>
        )}
        {lastTeam != null && (
          <span className="text-[11px] font-mono" style={{ color: 'var(--am-muted)' }}>
            {lastTeam}%
          </span>
        )}
      </div>

      {/* Legend below chart */}
      <div className="flex gap-5 mt-1">
        {trainerName && (
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--am-muted)' }}>
            <span className="inline-block w-6 h-0.5 rounded" style={{ background: 'var(--am-green)' }} />
            {trainerName}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--am-muted)' }}>
          <svg width="24" height="2" className="inline-block flex-shrink-0">
            <line x1="0" y1="1" x2="24" y2="1" stroke="var(--am-muted)" strokeWidth="1.5" strokeDasharray="5 3" />
          </svg>
          Team avg
        </span>
      </div>
    </div>
  )
}
