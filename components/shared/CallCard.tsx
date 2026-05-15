'use client'

import { useTranslations } from 'next-intl'
import type { BestCall } from '@/lib/types'

interface Props {
  call: BestCall
  variant?: 'best' | 'worst'
}

const palette = {
  best: {
    bg:       'rgba(34,217,160,0.08)',
    border:   'rgba(34,217,160,0.2)',
    scoreFg:  'var(--am-green)',
    resultFg: 'var(--am-green)',
    ctaFg:    'var(--am-green)',
  },
  worst: {
    bg:       'rgba(255,94,94,0.07)',
    border:   'rgba(255,94,94,0.2)',
    scoreFg:  'var(--am-red)',
    resultFg: 'var(--am-amber)',
    ctaFg:    'var(--am-green)',
  },
} as const

export function CallCard({ call, variant = 'best' }: Props) {
  const t = useTranslations('Shared.callCard')
  const p = palette[variant]
  const ctaPrefix = t(`${variant}.ctaPrefix` as 'best.ctaPrefix' | 'worst.ctaPrefix')

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2 border"
      style={{ background: p.bg, borderColor: p.border }}
    >
      {/* Trainer identifier — only shown in team context */}
      {call.trainerInitials && (
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold flex-shrink-0"
            style={{ background: call.trainerColor ?? 'var(--am-bg4)', color: '#fff' }}
          >
            {call.trainerInitials}
          </span>
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'var(--am-bg3)', color: 'var(--am-muted)' }}
          >
            {call.trainerName}
          </span>
        </div>
      )}

      {/* Top row: prospect · date  —  score · result */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--am-text)' }}>
            {call.prospect}
          </span>
          <span className="text-[11px] ml-1.5" style={{ color: 'var(--am-muted)' }}>
            · {call.date}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[12px] font-mono font-semibold" style={{ color: p.scoreFg }}>
            {(call.score / 20).toFixed(1)}/5
          </span>
          <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>·</span>
          <span className="text-[11px] font-semibold" style={{ color: p.resultFg }}>
            {call.result}
          </span>
        </div>
      </div>

      {/* Analysis text */}
      <p className="text-[12px] leading-relaxed" style={{ color: 'var(--am-text)', opacity: 0.85 }}>
        {call.analysis}
      </p>

      {/* CTA as plain link */}
      <span
        className="text-[11px] font-medium cursor-default"
        style={{ color: p.ctaFg }}
      >
        {ctaPrefix} {call.listenAt} →
      </span>
    </div>
  )
}
