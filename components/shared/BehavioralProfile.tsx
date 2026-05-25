'use client'

import { useTranslations } from 'next-intl'
import { toBarWidth, toDisplay5, toDisplay5Delta } from '@/lib/score-display'
import type { BehavioralDimension } from '@/lib/mock-data'

interface BehavioralProfileProps {
  dimensions: BehavioralDimension[]
  trainerName?: string
}

export function BehavioralProfile({ dimensions, trainerName = 'Sales Person' }: BehavioralProfileProps) {
  const t = useTranslations('Shared.behavioralProfile')

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
        {t('title')}
      </p>

      {dimensions.length === 0 ? (
        <p className="text-[12px]" style={{ color: 'var(--am-muted)' }}>
          {t('empty')}
        </p>
      ) : (
        <>
          {/* Rows */}
          <div className="flex flex-col gap-0">
            {dimensions.map((dim, i) => {
              const isAbove = dim.delta >= 0
              const barColor = isAbove ? 'var(--am-green)' : 'var(--am-amber)'

              return (
                <div
                  key={dim.dimension}
                  className="py-2.5"
                  style={{ borderBottom: i < dimensions.length - 1 ? '1px solid var(--am-border)' : 'none' }}
                >
                  {/* Mobile: label full width, then bar + meta below.
                      Desktop: single row grid */}
                  <div className="grid items-center gap-x-2 gap-y-1.5 grid-cols-2 sm:grid-cols-[140px_1fr_2.5rem_3.5rem]">
                    {/* Dimension name — full width on mobile */}
                    <span className="text-[12px] font-medium col-span-2 sm:col-span-1" style={{ color: 'var(--am-text)' }}>
                      {dim.dimension}
                    </span>

                    {/* Bar track — full width on mobile */}
                    <div className="relative h-[10px] rounded-full col-span-2 sm:col-span-1" style={{ background: 'var(--am-bg4)' }}>
                      <div
                        className="absolute left-0 top-0 h-full rounded-full"
                        style={{ width: `${toBarWidth(dim.score)}%`, background: barColor }}
                      />
                      <div
                        className="absolute top-0 h-full w-[2px] rounded-full"
                        style={{ left: `${toBarWidth(dim.teamAvg)}%`, background: 'rgba(255,255,255,0.5)', zIndex: 1 }}
                      />
                    </div>

                    {/* Score */}
                    <span className="text-[12px] font-mono font-semibold" style={{ color: 'var(--am-text)' }}>
                      {toDisplay5(dim.score)}
                    </span>

                    {/* Delta vs team avg */}
                    <span
                      className="text-[11px] font-mono font-semibold text-right"
                      style={{ color: isAbove ? 'var(--am-green)' : 'var(--am-red)' }}
                    >
                      {toDisplay5Delta(dim.delta)}
                    </span>
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
              {t('teamAvg')}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
