'use client'

import { cn } from '@/lib/utils'

const dotStyles = {
  red:   { background: 'var(--am-red)',   boxShadow: '0 0 6px var(--am-red)' },
  amber: { background: 'var(--am-amber)' },
  green: { background: 'var(--am-green)', boxShadow: '0 0 6px var(--am-green)' },
  blue:  { background: 'var(--am-blue)' },
}

interface AlertItemProps {
  dotColor: keyof typeof dotStyles
  text: string
  actionLabel: string
  onAction?: () => void
  className?: string
}

export function AlertItem({ dotColor, text, actionLabel, onAction, className }: AlertItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-3 py-2.5 rounded-lg mb-2 last:mb-0 border transition-colors cursor-default',
        className
      )}
      style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)' }}
    >
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={dotStyles[dotColor]} />
      <span className="flex-1 text-xs" style={{ color: 'var(--am-text)' }}>
        {text}
      </span>
      <button
        onClick={onAction}
        className="text-[11px] whitespace-nowrap hover:opacity-80 transition-opacity"
        style={{ color: 'var(--am-accent2)' }}
      >
        {actionLabel} →
      </button>
    </div>
  )
}
