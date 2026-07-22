import { cn } from '@/lib/utils'

interface NotSalesCallPillProps {
  /** Texto já traduzido — o chamador resolve via useTranslations('Shared.outcomes').notSalesCall. */
  label: string
  className?: string
}

export function NotSalesCallPill({ label, className }: NotSalesCallPillProps) {
  return (
    <span
      className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', className)}
      style={{ background: 'var(--am-bg4)', color: 'var(--am-muted)' }}
    >
      {label}
    </span>
  )
}
