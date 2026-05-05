'use client'

import type { BehavioralDimension } from '@/lib/mock-data'

const levelStyle = {
  High: { color: '#16a34a', bg: 'rgba(34,197,94,0.12)' },
  Med:  { color: '#d97706', bg: 'rgba(251,191,36,0.14)' },
  Low:  { color: 'var(--am-muted)', bg: 'rgba(122,132,154,0.12)' },
} as const

const sourceStyle = {
  Rubric:     { color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  Behavioral: { color: '#059669', bg: 'rgba(5,150,105,0.12)' },
} as const

function levelFromScore(score: number): 'High' | 'Med' | 'Low' {
  if (score >= 4.25) return 'High'
  if (score >= 3.5) return 'Med'
  return 'Low'
}

interface BehavioralProfileProps {
  dimensions: BehavioralDimension[]
  trainerName?: string
}

export function BehavioralProfile({ dimensions, trainerName = 'Trainer' }: BehavioralProfileProps) {
  return (
    <div
      className="rounded-2xl p-5 border shadow-md"
      style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
    >
      {/* Header */}
      <p
        className="text-[11px] font-semibold tracking-widest uppercase mb-5"
        style={{ color: 'var(--am-muted)' }}
      >
        Behavioral Correlation Profile
      </p>

      {/* Rows */}
      <div className="flex flex-col gap-0">
        {dimensions.map((dim, i) => {
          const isAbove = dim.delta >= 0
          const barColor = isAbove ? 'var(--am-green)' : 'var(--am-amber)'
          const markerPct = `${dim.teamAvg}%`
          const level = levelFromScore(dim.score)
          const source = dim.source
          const lvlStyle = levelStyle[level]
          const srcStyle = sourceStyle[source]

          return (
            <div
              key={dim.dimension}
              className="py-2.5"
              style={{ borderBottom: i < dimensions.length - 1 ? '1px solid var(--am-border)' : 'none' }}
            >
              {/* Mobile: label full width, then bar + meta below */}
              {/* Desktop: single row grid */}
              <div className="grid items-center gap-x-2 gap-y-1.5 grid-cols-2 sm:grid-cols-[140px_1fr_2.5rem_3.5rem_5.5rem]">

                {/* Dimension name — full width on mobile */}
                <span className="text-[12px] font-medium col-span-2 sm:col-span-1" style={{ color: 'var(--am-text)' }}>
                  {dim.dimension}
                </span>

                {/* Bar track — full width on mobile */}
                <div className="relative h-[10px] rounded-full col-span-2 sm:col-span-1" style={{ background: 'var(--am-bg4)' }}>
                  <div
                    className="absolute left-0 top-0 h-full rounded-full"
                    style={{ width: `${dim.score}%`, background: barColor }}
                  />
                  <div
                    className="absolute top-0 h-full w-[2px] rounded-full"
                    style={{ left: markerPct, background: 'rgba(255,255,255,0.5)', zIndex: 1 }}
                  />
                </div>

                {/* Score */}
                <span className="text-[12px] font-mono font-semibold" style={{ color: 'var(--am-text)' }}>
                  {dim.score}
                </span>

                {/* Delta */}
                <span
                  className="text-[11px] font-mono font-semibold text-right sm:text-right"
                  style={{ color: isAbove ? 'var(--am-green)' : 'var(--am-red)' }}
                >
                  {isAbove ? `+${dim.delta}` : dim.delta}
                </span>

                {/* Level + Source badges */}
                <div className="flex gap-1 col-span-2 sm:col-span-1 justify-start sm:justify-end flex-nowrap">
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap"
                    style={{ color: lvlStyle.color, background: lvlStyle.bg }}
                  >
                    {level}
                  </span>
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap"
                    style={{ color: srcStyle.color, background: srcStyle.bg }}
                  >
                    {source === 'Behavioral' ? 'Behav.' : source}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend below */}
      <div className="flex items-center gap-5 mt-4 flex-wrap">
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--am-muted)' }}>
          <span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: 'var(--am-green)' }} />
          {trainerName}
        </span>
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--am-muted)' }}>
          <span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: 'var(--am-muted)', opacity: 0.5 }} />
          Team avg
        </span>
      </div>
    </div>
  )
}
