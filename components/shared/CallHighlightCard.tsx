'use client'

import type { BestCall } from '@/lib/types'

interface Props {
  call: BestCall
}

export function CallHighlightCard({ call }: Props) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3 border border-l-[3px]"
      style={{
        background: '#151515',
        borderColor: 'rgba(34,217,160,0.3)',
        borderLeftColor: 'var(--am-green)',
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
            color: 'var(--am-green)',
            borderColor: 'rgba(34,217,160,0.4)',
            background: 'rgba(34,217,160,0.10)',
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
            color: 'var(--am-green)',
            background: 'rgba(34,217,160,0.12)',
          }}
        >
          {call.result}
        </span>
      </div>

      {/* AI Analysis */}
      <div>
        <p
          className="text-[10px] font-medium uppercase tracking-widest mb-1"
          style={{ color: 'var(--am-muted)' }}
        >
          AI Analysis
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
          color: 'var(--am-accent2)',
          borderColor: 'rgba(155,135,255,0.35)',
          background: 'rgba(110,86,255,0.08)',
        }}
      >
        Listen at {call.listenAt} →
      </button>
    </div>
  )
}
