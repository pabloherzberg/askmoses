'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { TrendPoint } from '@/lib/types'

interface TrendChartProps {
  data: TrendPoint[]
}

export function TrendChart({ data }: TrendChartProps) {
  return (
    <>
      {/* Legenda */}
      <div className="flex gap-4 mb-3">
        {[
          { color: '#22D9A0', label: 'Close rate %' },
          { color: '#9B87FF', label: 'Score' },
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
            stroke="#22D9A0"
            strokeWidth={2}
            dot={{ fill: '#22D9A0', r: 4, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#9B87FF"
            strokeWidth={2}
            dot={{ fill: '#9B87FF', r: 4, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
          <XAxis
            dataKey="week"
            tick={{ fill: '#7A849A', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[50, 100]}
            tick={{ fill: '#7A849A', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip
            contentStyle={{
              background: '#1A1E28',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: 10,
            }}
            labelStyle={{ color: '#7A849A', fontSize: 11 }}
            itemStyle={{ color: '#F0F2F8', fontSize: 13, fontWeight: 600 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}
