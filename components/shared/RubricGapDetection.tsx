'use client'

import { useTranslations } from 'next-intl'
import type { RubricGap } from '@/lib/types'

function FreqBadge({ value }: { value: number }) {
  const color =
    value >= 60 ? 'var(--am-red)' : value >= 45 ? 'var(--am-amber)' : 'var(--am-muted)'
  const bg =
    value >= 60
      ? 'rgba(255,94,94,0.12)'
      : value >= 45
      ? 'rgba(255,171,46,0.12)'
      : 'rgba(122,132,154,0.12)'

  return (
    <span
      className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full"
      style={{ color, background: bg }}
    >
      {value}%
    </span>
  )
}

interface Props {
  gaps: RubricGap[]
}

export function RubricGapDetection({ gaps }: Props) {
  const t = useTranslations('Shared.rubricGapDetection')

  return (
    <div
      className="rounded-2xl p-5 border shadow-md"
      style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
          {t('title')}
        </p>
      </div>

      {/* Single grid — headers + rows share the same column template */}
      <div
        className="grid gap-x-3 px-1"
        style={{ gridTemplateColumns: '3.5rem 1fr' }}
      >
        {/* Column headers */}
        {(['frequency', 'gapDetected'] as const).map((k) => (
          <span
            key={k}
            className="text-[10px] font-medium mb-2"
            style={{ color: 'var(--am-muted)' }}
          >
            {t(`th.${k}`)}
          </span>
        ))}

        {/* Rows */}
        {gaps.map((gap, i) => (
          <div key={gap.description} className="contents">
            <div
              className="flex items-center py-3"
              style={{ borderTop: i > 0 ? '1px solid var(--am-border)' : 'none' }}
            >
              <FreqBadge value={gap.frequency} />
            </div>

            <div
              className="flex items-start py-3 gap-2 flex-wrap"
              style={{ borderTop: i > 0 ? '1px solid var(--am-border)' : 'none' }}
            >
              <span className="text-[12px] flex-1 min-w-0" style={{ color: 'var(--am-text)' }}>
                {gap.description}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => {}}
                  className="text-[11px] font-mono px-2.5 py-1 rounded-lg border cursor-default"
                  style={{
                    color: 'var(--am-accent2)',
                    borderColor: 'rgba(155,135,255,0.35)',
                    background: 'rgba(110,86,255,0.08)',
                  }}
                >
                  {t('addToRubric')}
                </button>
                <span
                  className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full border"
                  style={{
                    color: 'var(--am-red)',
                    borderColor: 'rgba(255,94,94,0.35)',
                    background: 'rgba(255,94,94,0.08)',
                  }}
                >
                  {t('notCovered')}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}
