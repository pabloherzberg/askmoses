'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
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

function labelWeek(w: string) {
  const num = parseInt(w.replace(/\D/g, ''), 10)
  if (!isNaN(num)) return `Week ${num}`
  return w
}

export function PerformanceTrend({ trends, salesPeople, fixedId, chartHeight = 200 }: PerformanceTrendProps) {
  const t = useTranslations('Shared.performanceTrend')
  const [selected, setSelected] = useState<string>('team')

  const activeId = fixedId ?? selected
  const data = (trends[activeId] ?? []).map((d) => ({
    ...d,
    weekLabel: labelWeek(d.week),
  }))

  const trainerName = fixedId
    ? (salesPeople?.find((s) => s.id === fixedId)?.name ?? null)
    : selected === 'team'
    ? null
    : salesPeople?.find((s) => s.id === selected)?.name ?? null

  // Team avg data for overlay (only in fixedId mode — show trainer vs team)
  const teamData = (trends['team'] ?? []).map((d) => ({
    ...d,
    weekLabel: labelWeek(d.week),
  }))

  // Merge trainer + team avg numa série só. Semana sem call vira 0 (linha
  // contínua, sem pontos soltos no gráfico); o flag *Missing faz o tooltip
  // mostrar "sem chamadas" em vez de um "0%" enganoso.
  const merged = data.map((d, i) => {
    const teamRaw = teamData[i]?.closeRate ?? null
    return {
      weekLabel: d.weekLabel,
      closeRate: d.closeRate ?? 0,
      closeRateMissing: d.closeRate == null,
      teamCloseRate: teamRaw ?? 0,
      teamCloseRateMissing: teamRaw == null,
    }
  })

  // Última semana COM dado (a semana corrente costuma estar vazia).
  const lastTrainer =
    [...data].reverse().find((d) => d.closeRate != null)?.closeRate ?? null
  const lastTeam =
    [...teamData].reverse().find((d) => d.closeRate != null)?.closeRate ?? null

  return (
    <div
      className="rounded-2xl p-5 border shadow-md mb-4"
      style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
    >
      {/* Header */}
      <p
        className="text-[11px] font-semibold tracking-widest uppercase mb-4"
        style={{ color: 'var(--am-muted)' }}
      >
        Conversion Rate Trend
      </p>

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
              domain={[0, 100]}
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
              formatter={(value, name, item) => {
                const row = item?.payload as Record<string, unknown> | undefined
                if (name === 'closeRate') {
                  return [
                    row?.closeRateMissing ? t('noCalls') : `${value}%`,
                    trainerName ?? 'Close Rate',
                  ]
                }
                if (name === 'teamCloseRate') {
                  return [
                    row?.teamCloseRateMissing ? t('noCalls') : `${value}%`,
                    'Team avg',
                  ]
                }
                return [`${value}`, name as string]
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
              connectNulls
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
              connectNulls
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
