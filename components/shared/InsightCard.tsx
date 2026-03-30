'use client'

import { cn } from '@/lib/utils'
import type { Insight } from '@/lib/types'

const tagStyles = {
  red: { background: 'var(--am-red-bg)', color: 'var(--am-red)' },
  amber: { background: 'var(--am-amber-bg)', color: 'var(--am-amber)' },
  blue: { background: 'var(--am-blue-bg)', color: 'var(--am-blue)' },
  green: { background: 'var(--am-green-bg)', color: 'var(--am-green)' },
}

interface InsightCardProps {
  insight: Insight
  className?: string
}

export function InsightCard({ insight, className }: InsightCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl p-[18px_20px] border transition-all duration-200 hover:-translate-y-px',
        className
      )}
      style={{
        background: 'var(--card)',
        borderColor: 'var(--am-border)',
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = 'var(--am-border2)')
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = 'var(--am-border)')
      }
    >
      <div className="flex items-start gap-2.5 mb-2.5">
        <span className="text-lg leading-none flex-shrink-0 mt-0.5">{insight.icon}</span>
        <div className="flex-1">
          <p className="text-[13px] font-medium leading-snug" style={{ color: 'var(--am-text)' }}>
            {insight.title}
          </p>
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full mt-1.5 inline-block font-mono"
            style={tagStyles[insight.tagColor]}
          >
            {insight.tag}
          </span>
        </div>
      </div>

      <p className="text-xs leading-relaxed mb-2.5" style={{ color: 'var(--am-muted)' }}>
        {insight.summary}
      </p>

      <div
        className="text-xs leading-relaxed px-3 py-2 rounded-lg border-l-2"
        style={{
          background: 'var(--am-bg3)',
          borderLeftColor: 'var(--am-accent)',
          color: 'var(--am-text)',
        }}
      >
        {insight.action}
      </div>
    </div>
  )
}
