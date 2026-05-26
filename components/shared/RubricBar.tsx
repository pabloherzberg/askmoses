import { Users } from 'lucide-react'
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
  /**
   * Quando definido, renderiza um tick vertical na barra na posição da média
   * do time + um marcador inline (Users + valor 0–5) ao lado do score.
   * Espera escala 0–100 (igual a `value`).
   */
  teamAvg?: number
  className?: string
}

export function RubricBar({
  label,
  value,
  color,
  showValue = true,
  teamAvg,
  className,
}: RubricBarProps) {
  const widthPct = toBarWidth(value)
  const displayValue = toDisplay5(value)
  const hasTeam = teamAvg !== undefined
  const teamPct = hasTeam ? toBarWidth(teamAvg as number) : 0

  // Bar mais alta quando há tick (5px é fino demais pra um marker de 2px aparecer).
  const barHeight = hasTeam ? 8 : 5

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="text-xs w-36 flex-shrink-0" style={{ color: 'var(--am-muted)' }}>
        {label}
      </span>
      <div
        className="flex-1 relative rounded-full overflow-hidden"
        style={{ background: 'var(--am-bg4)', height: barHeight }}
      >
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${widthPct}%`, background: colorMap[color] }}
        />
        {hasTeam && (
          <div
            className="absolute top-0 h-full w-[2px] rounded-full"
            style={{ left: `${teamPct}%`, background: 'rgba(255,255,255,0.6)', zIndex: 1 }}
          />
        )}
      </div>
      {showValue && (
        <span className="text-xs font-medium font-mono w-8 text-right" style={{ color: 'var(--am-text)' }}>
          {displayValue}
        </span>
      )}
      {hasTeam && (
        <span
          className="flex items-center gap-1.5 text-xs font-mono font-medium w-14 justify-end"
          style={{ color: 'var(--am-muted)' }}
          aria-label={`Team average ${toDisplay5(teamAvg as number)}`}
        >
          <Users size={13} aria-hidden="true" />
          {toDisplay5(teamAvg as number)}
        </span>
      )}
    </div>
  )
}
