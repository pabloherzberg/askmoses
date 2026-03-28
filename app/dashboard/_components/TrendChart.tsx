'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useTheme } from 'next-themes'
import type { TrendPoint } from '@/lib/types'

interface TrendChartProps {
  data: TrendPoint[]
}

export function TrendChart({ data }: TrendChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const colors = useMemo(() => ({
    green:         isDark ? '#22D9A0' : '#12A371',
    purple:        isDark ? '#9B87FF' : '#0055FF',
    muted:         isDark ? '#7A849A' : '#5A6478',
    tooltipBg:     isDark ? '#1A1E28' : '#FFFFFF',
    tooltipBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    tooltipItem:   isDark ? '#F0F2F8' : '#0F1928',
  }), [isDark])

  return (
    <>
      {/* Legenda */}
      <div className="flex gap-4 mb-3">
        {[
          { color: colors.green, label: 'Close rate %' },
          { color: colors.purple, label: 'Score' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--am-muted)' }}>
            <span className="inline-block w-5 h-0.5 rounded" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="closeRate"
            stroke={colors.green}
            strokeWidth={2}
            dot={{ fill: colors.green, r: 4, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke={colors.purple}
            strokeWidth={2}
            dot={{ fill: colors.purple, r: 4, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
          <XAxis
            dataKey="week"
            tick={{ fill: colors.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[50, 100]}
            tick={{ fill: colors.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip
            contentStyle={{
              background: colors.tooltipBg,
              border: `1px solid ${colors.tooltipBorder}`,
              borderRadius: 8,
              padding: 10,
            }}
            labelStyle={{ color: colors.muted, fontSize: 11 }}
            itemStyle={{ color: colors.tooltipItem, fontSize: 13, fontWeight: 600 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}
