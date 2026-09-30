'use client'

import { useTranslations } from 'next-intl'
import { scoreColorVar, toBarWidth, toDisplay5Suffixed } from '@/lib/score-display'
import type { CorrelationFactor } from '@/lib/types'

// Painel "Coaching Drivers": média do time por dimensão da rubrica. NÃO é
// correlação com fechamento — essa análise não existe. As barras usam as
// mesmas faixas de score do resto do produto (scoreColorVar).

interface Props {
  factors: CorrelationFactor[]
}

export function CorrelationEngine({ factors }: Props) {
  const t = useTranslations('Shared.correlationEngine')

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

      {/* Column headers */}
      <div className="grid items-center mb-2 gap-2" style={{ gridTemplateColumns: '1fr 3rem' }}>
        <span className="text-[10px] font-medium" style={{ color: 'var(--am-muted)' }}>{t('th.score')}</span>
        <span className="text-[10px] font-medium text-right" style={{ color: 'var(--am-muted)' }}>{t('th.percent')}</span>
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

            {/* Grid row: bar + score */}
            <div
              className="grid items-center gap-2"
              style={{ gridTemplateColumns: '1fr 3rem' }}
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
                      width: `${toBarWidth(f.score)}%`,
                      background: scoreColorVar(f.score),
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>

              {/* Score */}
              <span className="text-[12px] font-mono text-right" style={{ color: 'var(--am-text)' }}>
                {toDisplay5Suffixed(f.score)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
