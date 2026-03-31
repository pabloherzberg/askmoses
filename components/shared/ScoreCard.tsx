import type React from 'react'
import { cn } from '@/lib/utils'

interface ScoreCardProps {
  label: string
  value: string | number
  valueColor?: string
  delta?: number
  deltaLabel?: string
  className?: string
  style?: React.CSSProperties
}

export function ScoreCard({ label, value, valueColor, delta, deltaLabel, className, style }: ScoreCardProps) {
  const isPositive = delta !== undefined && delta > 0
  const isNegative = delta !== undefined && delta < 0

  return (
    <div
      className={cn(
        'rounded-xl p-[18px_20px] border shadow-md transition-colors am-fade-up',
        className
      )}
      style={{
        background: 'var(--card)',
        borderColor: 'var(--am-border)',
        ...style,
      }}
    >
      <div className="text-xs mb-2" style={{ color: 'var(--am-muted)' }}>
        {label}
      </div>
      <div
        className="text-[28px] font-semibold tracking-tight leading-none mb-1.5"
        style={{ color: valueColor ?? 'var(--am-text)' }}
      >
        {value}
      </div>
      {(delta !== undefined || deltaLabel) && (
        <div
          className="text-xs"
          style={{
            color:
              delta === undefined
                ? 'var(--am-muted)'
                : isPositive
                  ? 'var(--am-green)'
                  : isNegative
                    ? 'var(--am-red)'
                    : 'var(--am-muted)',
          }}
        >
          {delta !== undefined && (
            <>
              {isPositive ? '↑' : isNegative ? '↓' : ''}{' '}
              {isPositive ? `+${delta}` : delta}
              {deltaLabel ? ' ' : ''}
            </>
          )}
          {deltaLabel}
        </div>
      )}
    </div>
  )
}
