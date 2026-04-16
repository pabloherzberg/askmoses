'use client'

import type { BestCall } from '@/lib/types'

interface Props {
  call: BestCall
}

export function WorstCallCard({ call }: Props) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3 border border-l-[3px]"
      style={{
        background: 'var(--card)',
        borderColor: 'rgba(255,94,94,0.25)',
        borderLeftColor: 'var(--am-red)',
      }}
    >
      {/* Top row: prospect + score */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold" style={{ color: 'var(--am-text)' }}>
            {call.prospect}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--am-muted)' }}>
            {call.date}
          </p>
        </div>
        <span
          className="text-[12px] font-mono font-semibold px-2.5 py-0.5 rounded-full border flex-shrink-0"
          style={{
            color: 'var(--am-red)',
            borderColor: 'rgba(255,94,94,0.4)',
            background: 'rgba(255,94,94,0.10)',
          }}
        >
          {call.score}/100
        </span>
      </div>

      {/* Result badge */}
      <div>
        <span
          className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full"
          style={{
            color: 'var(--am-amber)',
            background: 'rgba(255,171,46,0.12)',
          }}
        >
          {call.result}
        </span>
      </div>

      {/* Error Analysis */}
      <div>
        <p
          className="text-[10px] font-medium uppercase tracking-widest mb-1"
          style={{ color: 'var(--am-muted)' }}
        >
          Error Analysis
        </p>
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--am-text)' }}>
          {call.analysis}
        </p>
      </div>

      {/* Listen CTA */}
      <button
        onClick={() => {}}
        className="self-start text-[11px] font-mono px-3 py-1.5 rounded-lg border cursor-default"
        style={{
          color: 'var(--am-red)',
          borderColor: 'rgba(255,94,94,0.35)',
          background: 'rgba(255,94,94,0.08)',
        }}
      >
        Review at {call.listenAt} →
      </button>
    </div>
  )
}
