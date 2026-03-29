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
    <div>
      {/* Legend */}
      <div className="flex gap-4 mb-3">
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--am-muted)' }}>
          <span className="inline-block w-5 h-0.5 rounded" style={{ background: 'var(--am-green)' }} />
          Close Rate %
        </span>
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--am-muted)' }}>
          <span className="inline-block w-5 h-0.5 rounded" style={{ background: 'var(--am-accent2)' }} />
          Score
        </span>
      </div>
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="week"
              tick={{ fill: 'var(--am-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--am-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--am-bg3)',
                border: '1px solid var(--am-border2)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--am-text)',
              }}
              labelStyle={{ color: 'var(--am-muted)', fontSize: 11 }}
            />
            <Line
              type="monotone"
              dataKey="closeRate"
              name="Close Rate"
              stroke="var(--am-green)"
              strokeWidth={2}
              dot={{ r: 4, fill: 'var(--am-green)' }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="score"
              name="Score"
              stroke="var(--am-accent2)"
              strokeWidth={2}
              dot={{ r: 4, fill: 'var(--am-accent2)' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
