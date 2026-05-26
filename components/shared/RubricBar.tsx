import { cn } from '@/lib/utils'
import { toBarWidth, toDisplay5 } from '@/lib/score-display'
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
  /** Value in 0–100 scale (canonical bank scale). */
  value: number
  color: RubricColor
  showValue?: boolean
  className?: string
}

export function RubricBar({
  label,
  value,
  color,
  showValue = true,
  className,
}: RubricBarProps) {
  const widthPct = toBarWidth(value)
  const displayValue = toDisplay5(value)
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
