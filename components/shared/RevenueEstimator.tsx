'use client'

import { useTranslations } from 'next-intl'
import type { RevenueEstimatorItem } from '@/lib/types'

interface RevenueEstimatorProps {
  items: RevenueEstimatorItem[]
  total: number
}

const confidenceStyle: Record<RevenueEstimatorItem['confidence'], { background: string; color: string }> = {
  High: { background: 'var(--am-green-bg)', color: 'var(--am-green)' },
  Med:  { background: 'var(--am-amber-bg)', color: 'var(--am-amber)' },
  Low:  { background: 'var(--am-red-bg)',   color: 'var(--am-red)'   },
}

function formatImpact(value: number) {
  return `+$${value.toLocaleString('en-US')}/mo`
}

export function RevenueEstimator({ items, total }: RevenueEstimatorProps) {
  const t = useTranslations('Shared.revenueEstimator')
  const tLevels = useTranslations('Shared.correlationEngine.levels')

  return (
    <div
      className="rounded-2xl p-5 border shadow-md mb-4"
      style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
          {t('title')}
        </p>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded"
          style={{ background: 'var(--am-amber-bg)', color: 'var(--am-amber)' }}
        >
          {t('mockBadge')}
        </span>
      </div>

      {/* Column headers */}
      <div className="hidden sm:grid grid-cols-[1fr_140px_120px_72px] gap-2 pb-2 mb-1"
        style={{ borderBottom: '1px solid var(--am-border)' }}
      >
        {(['section', 'teamAvgTarget', 'monthlyImpact', 'confidence'] as const).map((k) => (
          <p key={k} className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
            {t(`th.${k}`)}
          </p>
        ))}
      </div>

      {/* Rows */}
      {items.map((item) => (
        <div
          key={item.section}
          className="grid grid-cols-2 sm:grid-cols-[1fr_140px_120px_72px] gap-2 py-2.5"
          style={{ borderBottom: '1px solid var(--am-border)' }}
        >
          <p className="text-[13px] font-medium col-span-2 sm:col-span-1" style={{ color: 'var(--am-text)' }}>
            {item.section}
          </p>
          <p className="text-xs font-mono" style={{ color: 'var(--am-muted)' }}>
            {item.current}{' '}
            <span style={{ color: 'var(--am-muted)' }}>→</span>{' '}
            <span className="font-semibold" style={{ color: 'var(--am-text)' }}>{item.target}</span>
          </p>
          <p className="text-sm font-semibold font-mono" style={{ color: 'var(--am-green)' }}>
            {formatImpact(item.monthlyImpact)}
          </p>
          <div className="flex items-center">
            <span
              className="text-[11px] font-medium px-2 py-0.5 rounded"
              style={confidenceStyle[item.confidence]}
            >
              {tLevels(item.confidence)}
            </span>
          </div>
        </div>
      ))}

      {/* Total */}
      <div className="grid grid-cols-2 sm:grid-cols-[1fr_140px_120px_72px] gap-2 pt-3">
        <p className="text-[13px] font-medium col-span-2 sm:col-span-1" style={{ color: 'var(--am-muted)' }}>
          {t('totalOpportunity')}
        </p>
        <p className="hidden sm:block" />
        <p className="text-base font-bold font-mono" style={{ color: 'var(--am-green)' }}>
          {formatImpact(total)}
        </p>
      </div>

      {/* Footer note */}
      <p className="text-[10px] mt-3" style={{ color: 'var(--am-amber)' }}>
        {t('mockFooter')}
      </p>
    </div>
  )
}
