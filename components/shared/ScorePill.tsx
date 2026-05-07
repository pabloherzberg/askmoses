import { cn } from '@/lib/utils'

interface ScorePillProps {
  score: number
  className?: string
}

export function ScorePill({ score, className }: ScorePillProps) {
  const variant =
    score >= 4.25 ? 'green' : score >= 3.75 ? 'amber' : 'red'

  const styles = {
    green: { background: 'var(--am-green-bg)',  color: 'var(--am-green)' },
    amber: { background: 'var(--am-amber-bg)',  color: 'var(--am-amber)' },
    red:   { background: 'var(--am-red-bg)',    color: 'var(--am-red)' },
  }

  return (
    <span
      className={cn('px-2 py-0.5 rounded-full text-xs font-semibold font-mono', className)}
      style={styles[variant]}
    >
      {score.toFixed(1)}
    </span>
  )
}
