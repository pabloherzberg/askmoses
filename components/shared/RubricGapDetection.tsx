'use client'

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
  return (
    <div
      className="rounded-2xl p-5 border shadow-md"
      style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
          Rubric Gap Detection
        </p>
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
          style={{
            color: 'var(--am-amber)',
            borderColor: 'rgba(255,171,46,0.35)',
            background: 'rgba(255,171,46,0.08)',
          }}
        >
          mock data only
        </span>
      </div>

      {/* Single grid — headers + rows share the same column template */}
      <div
        className="grid gap-x-3 px-1"
        style={{ gridTemplateColumns: '3.5rem 1fr 9rem 7rem' }}
      >
        {/* Column headers */}
        {['Freq.', 'Gap detected', 'Action', 'Status'].map((h) => (
          <span
            key={h}
            className="text-[10px] font-medium mb-2"
            style={{ color: 'var(--am-muted)' }}
          >
            {h}
          </span>
        ))}

        {/* Rows — use `contents` so each cell participates in the parent grid */}
        {gaps.map((gap, i) => (
          <div key={gap.description} className="contents">
            <div
              className="flex items-center py-3"
              style={{ borderTop: i > 0 ? '1px solid var(--am-border)' : 'none' }}
            >
              <FreqBadge value={gap.frequency} />
            </div>

            <div
              className="flex items-center py-3"
              style={{ borderTop: i > 0 ? '1px solid var(--am-border)' : 'none' }}
            >
              <span className="text-[12px]" style={{ color: 'var(--am-text)' }}>
                {gap.description}
              </span>
            </div>

            <div
              className="flex items-center py-3"
              style={{ borderTop: i > 0 ? '1px solid var(--am-border)' : 'none' }}
            >
              <button
                onClick={() => {}}
                className="text-[11px] font-mono px-2.5 py-1 rounded-lg border cursor-default"
                style={{
                  color: 'var(--am-accent2)',
                  borderColor: 'rgba(155,135,255,0.35)',
                  background: 'rgba(110,86,255,0.08)',
                }}
              >
                Add to rubric →
              </button>
            </div>

            <div
              className="flex items-center py-3"
              style={{ borderTop: i > 0 ? '1px solid var(--am-border)' : 'none' }}
            >
              <span
                className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full border"
                style={{
                  color: 'var(--am-red)',
                  borderColor: 'rgba(255,94,94,0.35)',
                  background: 'rgba(255,94,94,0.08)',
                }}
              >
                Not covered
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p className="mt-3 text-[10px]" style={{ color: 'var(--am-amber)' }}>
        † all values sourced from mock-data.ts — Add to rubric → is non-functional in demo
      </p>
    </div>
  )
}
