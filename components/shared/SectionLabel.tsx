import { cn } from '@/lib/utils'

interface SectionLabelProps {
  children: React.ReactNode
  className?: string
}

export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <p
      className={cn('text-[11px] font-medium tracking-[0.1em] uppercase mb-3.5', className)}
      style={{ color: 'var(--am-muted)' }}
    >
      {children}
    </p>
  )
}
