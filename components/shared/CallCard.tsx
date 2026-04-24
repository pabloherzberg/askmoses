'use client'

import { useTranslations } from 'next-intl'
import type { BestCall } from '@/lib/types'

interface Props {
  call: BestCall
  variant?: 'best' | 'worst'
}

const palette = {
  best: {
    border:     'rgba(34,217,160,0.3)',
    borderLeft: 'var(--am-green)',
    scoreFg:    'var(--am-green)',
    scoreBorder:'rgba(34,217,160,0.4)',
    scoreBg:    'rgba(34,217,160,0.10)',
    resultFg:   'var(--am-green)',
    resultBg:   'rgba(34,217,160,0.12)',
    ctaFg:      'var(--am-accent2)',
    ctaBorder:  'rgba(155,135,255,0.35)',
    ctaBg:      'rgba(110,86,255,0.08)',
  },
  worst: {
    border:     'rgba(255,94,94,0.25)',
    borderLeft: 'var(--am-red)',
    scoreFg:    'var(--am-red)',
    scoreBorder:'rgba(255,94,94,0.4)',
    scoreBg:    'rgba(255,94,94,0.10)',
    resultFg:   'var(--am-amber)',
    resultBg:   'rgba(255,171,46,0.12)',
    ctaFg:      'var(--am-red)',
    ctaBorder:  'rgba(255,94,94,0.35)',
    ctaBg:      'rgba(255,94,94,0.08)',
  },
} as const

export function CallCard({ call, variant = 'best' }: Props) {
  const t = useTranslations('Shared.callCard')
  const p = palette[variant]
  const analysisLabel = t(`${variant}.analysisLabel` as 'best.analysisLabel' | 'worst.analysisLabel')
  const ctaPrefix = t(`${variant}.ctaPrefix` as 'best.ctaPrefix' | 'worst.ctaPrefix')

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3 border border-l-[3px]"
      style={{
        background: 'var(--card)',
        borderColor: p.border,
        borderLeftColor: p.borderLeft,
      }}
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
          style={{ color: p.scoreFg, borderColor: p.scoreBorder, background: p.scoreBg }}
        >
          {call.score}/100
        </span>
      </div>

      {/* Result badge */}
      <div>
        <span
          className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full"
          style={{ color: p.resultFg, background: p.resultBg }}
        >
          {call.result}
        </span>
      </div>

      {/* Analysis */}
      <div>
        <p
          className="text-[10px] font-medium uppercase tracking-widest mb-1"
          style={{ color: 'var(--am-muted)' }}
        >
          {analysisLabel}
        </p>
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--am-text)' }}>
          {call.analysis}
        </p>
      </div>

      {/* CTA — disabled in demo */}
      <button
        type="button"
        disabled
        className="self-start text-[11px] font-mono px-3 py-1.5 rounded-lg border opacity-60 cursor-not-allowed"
        style={{ color: p.ctaFg, borderColor: p.ctaBorder, background: p.ctaBg }}
        aria-label={t('ctaAria', { prefix: ctaPrefix, time: call.listenAt })}
      >
        {ctaPrefix} {call.listenAt} →
      </button>
    </div>
  )
}
