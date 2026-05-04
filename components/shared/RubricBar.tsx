import { cn } from '@/lib/utils'
import type { RubricColor } from '@/lib/types'

const colorMap: Record<RubricColor, string> = {
  blue:    'var(--am-blue)',
  amber:   'var(--am-amber)',
  green:   'var(--am-green)',
  red:     'var(--am-red)',
  accent2: 'var(--am-accent2)',
}

interface RubricBarProps {
  label: string
  value: number
  /** Upper bound of `value`. Default 100 (trainer rubric aggregates).
   *  Pass `max={5}` for per-section scores from Prompt v2. */
  max?: number
  color: RubricColor
  showValue?: boolean
  className?: string
}

export function RubricBar({
  label,
  value,
  max = 100,
  color,
  showValue = true,
  className,
}: RubricBarProps) {
  const widthPct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const displayValue = max <= 10 ? value.toFixed(1) : Math.round(value).toString()
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="text-xs w-36 flex-shrink-0" style={{ color: 'var(--am-muted)' }}>
        {label}
      </span>
      <div
        className="flex-1 h-[5px] rounded-full overflow-hidden"
        style={{ background: 'var(--am-bg4)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${widthPct}%`, background: colorMap[color] }}
        />
      </div>
      {showValue && (
        <span className="text-xs font-medium font-mono w-8 text-right" style={{ color: 'var(--am-text)' }}>
          {displayValue}
        </span>
      )}
    </div>
  )
}
