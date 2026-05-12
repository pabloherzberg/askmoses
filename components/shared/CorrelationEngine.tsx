'use client'

import { useTranslations } from 'next-intl'
import { Info } from 'lucide-react'
import type { CorrelationFactor, CorrelationLevel, CorrelationSource } from '@/lib/types'

const barColor: Record<CorrelationLevel, string> = {
  High: 'var(--am-green)',
  Med: 'var(--am-amber)',
  Low: 'var(--am-muted)',
}

const levelStyle: Record<CorrelationLevel, { color: string; bg: string }> = {
  High: { color: 'var(--am-green)', bg: 'rgba(34,217,160,0.12)' },
  Med: { color: 'var(--am-amber)', bg: 'rgba(255,171,46,0.12)' },
  Low: { color: 'var(--am-muted)', bg: 'rgba(122,132,154,0.12)' },
}

const sourceStyle: Record<CorrelationSource, { color: string; bg: string }> = {
  Rubric: { color: 'var(--am-accent2)', bg: 'rgba(155,135,255,0.12)' },
  Behavioral: { color: 'var(--am-green)', bg: 'rgba(34,217,160,0.12)' },
}

// Volume mínimo para o título exibir linguagem estatística ("Correlation Engine —
// What Drives Closes"). Abaixo disso o título fala em médias por dimensão e o
// disclaimer abaixo explica que a correlação estatística virá com volume.
const MIN_CALLS_FOR_STATS = 30

interface Props {
  factors: CorrelationFactor[]
  totalCalls?: number
}

export function CorrelationEngine({ factors, totalCalls = 0 }: Props) {
  const t = useTranslations('Shared.correlationEngine')
  const hasVolume = totalCalls >= MIN_CALLS_FOR_STATS

  function LevelBadge({ value }: { value: CorrelationLevel }) {
    const s = levelStyle[value]
    return (
      <span
        className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full"
        style={{ color: s.color, background: s.bg }}
      >
        {t(`levels.${value}`)}
      </span>
    )
  }

  function SourceBadge({ value }: { value: CorrelationSource }) {
    const s = sourceStyle[value]
    return (
      <span
        className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full"
        style={{ color: s.color, background: s.bg }}
      >
        {t(`sources.${value}`)}
      </span>
    )
  }

  return (
    <div
      className="rounded-2xl p-5 border shadow-md"
      style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
          {hasVolume ? t('title') : t('titleNoVolume')}
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {([
          { level: 'High' as CorrelationLevel, key: 'highCorrelation' },
          { level: 'Med' as CorrelationLevel, key: 'medCorrelation' },
          { level: 'Low' as CorrelationLevel, key: 'lowCorrelation' },
        ]).map(({ level, key }) => (
          <div key={level} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0"
              style={{ background: barColor[level] }}
            />
            <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
              {t(`legend.${key}`)}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0" style={{ background: 'var(--am-accent2)' }} />
          <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>{t('legend.rubric')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0" style={{ background: 'var(--am-green)' }} />
          <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>{t('legend.behavioral')}</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid items-center mb-2 gap-2" style={{ gridTemplateColumns: '3fr 3rem 4rem 4rem 5rem' }}>
        <span className="text-[10px] font-medium" style={{ color: 'var(--am-muted)' }}>{t('th.score')}</span>
        <span className="text-[10px] font-medium text-right" style={{ color: 'var(--am-muted)' }}>{t('th.percent')}</span>
        <span className="text-[10px] font-medium text-center" style={{ color: 'var(--am-muted)' }}>{t('th.correlation')}</span>
        <span className="text-[10px] font-medium text-center" style={{ color: 'var(--am-muted)' }}>{t('th.impact')}</span>
        <span className="text-[10px] font-medium text-center" style={{ color: 'var(--am-muted)' }}>{t('th.source')}</span>
      </div>

      {/* Rows */}
      <div className="flex flex-col">
        {factors.map((f, i) => (
          <div
            key={f.label}
            className="py-2"
            style={{ borderTop: i > 0 ? '1px solid var(--am-border)' : 'none' }}
          >
            {/* Label — full width on mobile only */}
            <span
              className="block sm:hidden text-[11px] font-medium mb-1.5"
              style={{ color: 'var(--am-text)' }}
            >
              {f.label}
            </span>

            {/* Grid row: bar + badges */}
            <div
              className="grid items-center gap-2"
              style={{ gridTemplateColumns: '3fr 3rem 4rem 4rem 5rem' }}
            >
              {/* Bar (with label on sm+) */}
              <div className="flex flex-col gap-1 min-w-0">
                <span
                  className="hidden sm:block text-[11px] font-medium truncate"
                  style={{ color: 'var(--am-text)' }}
                >
                  {f.label}
                </span>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: 'var(--am-bg4)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(f.score / 5) * 100}%`,
                      background: barColor[f.correlation],
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>

              {/* Score */}
              <span className="text-[12px] font-mono text-right" style={{ color: 'var(--am-text)' }}>
                {f.score.toFixed(1)}/5
              </span>

              {/* Correlation badge */}
              <div className="flex justify-center">
                <LevelBadge value={f.correlation} />
              </div>

              {/* Impact badge */}
              <div className="flex justify-center">
                <LevelBadge value={f.impact} />
              </div>

              {/* Source badge */}
              <div className="flex justify-center">
                <SourceBadge value={f.source} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Disclaimer — só aparece enquanto não há volume mínimo de calls */}
      {!hasVolume && (
        <div
          className="mt-4 pt-3 flex items-start gap-2 text-[11px] italic"
          style={{ borderTop: '1px solid var(--am-border)', color: 'var(--am-muted)' }}
        >
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          <span>{t('disclaimer')}</span>
        </div>
      )}
    </div>
  )
}
