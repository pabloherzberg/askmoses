import { cn } from '@/lib/utils'
import { scorePalette, toDisplay5 } from '@/lib/score-display'

interface ScorePillProps {
  /** Score in 0–100 (canonical scale). */
  score: number
  className?: string
}

export function ScorePill({ score, className }: ScorePillProps) {
  const { fg, bg } = scorePalette(score)
  return (
    <span
      className={cn('px-2 py-0.5 rounded-full text-xs font-semibold font-mono', className)}
      style={{ background: bg, color: fg }}
    >
      {toDisplay5(score)}
    </span>
  )
}
