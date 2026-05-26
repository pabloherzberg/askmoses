'use client'

import { useLocale, useTranslations } from 'next-intl'
import { toDisplay5Suffixed } from '@/lib/score-display'
import { normaliseOutcome } from '@/lib/constants'
import type { BestCall } from '@/lib/types'

interface Props {
  call: BestCall
  variant?: 'best' | 'worst'
}

// ISO date → "15 set" / "Sep 15" / etc. Returns the original string if it
// isn't a parseable date (preserves the upstream "—" placeholder).
function formatDate(value: string, locale: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

// Resolve any historical/legacy outcome shape ("Closed", "Not closed",
// "no_close", "follow_up"…) to a canonical CallOutcome key for the i18n
// lookup. Returns null when no mapping fits — caller falls back to raw.
function canonicalOutcome(raw: string): string | null {
  const lc = raw.toLowerCase().replace(/ /g, '_')
  return normaliseOutcome(lc)
}

const palette = {
  best: {
    bg:       'rgba(34,217,160,0.08)',
    border:   'rgba(34,217,160,0.2)',
    scoreFg:  'var(--am-green)',
    resultFg: 'var(--am-green)',
  },
  worst: {
    bg:       'rgba(255,94,94,0.07)',
    border:   'rgba(255,94,94,0.2)',
    scoreFg:  'var(--am-red)',
    resultFg: 'var(--am-amber)',
  },
} as const

export function CallCard({ call, variant = 'best' }: Props) {
  const p = palette[variant]
  const locale = useLocale()
  const tOutcomes = useTranslations('Shared.outcomes')

  const formattedDate = formatDate(call.date, locale)
  // Server emits canonical outcome enum, but old cached responses or seed data
  // may still carry prettified shapes ("Closed", "Not closed"). Normalise here
  // before the i18n lookup so we don't blow up on `Shared.outcomes.short.Closed`.
  const outcomeKey = canonicalOutcome(call.result)
  const resultLabel = outcomeKey ? tOutcomes(`short.${outcomeKey}`) : call.result

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
            · {formattedDate}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[12px] font-mono font-semibold" style={{ color: p.scoreFg }}>
            {toDisplay5Suffixed(call.score)}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>·</span>
          <span className="text-[11px] font-semibold" style={{ color: p.resultFg }}>
            {resultLabel}
          </span>
        </div>
      </div>

      {/* Analysis text */}
      <p className="text-[12px] leading-relaxed" style={{ color: 'var(--am-text)', opacity: 0.85 }}>
        {call.analysis}
      </p>
    </div>
  )
}
