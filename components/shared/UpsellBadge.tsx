import { Sparkles, Lock } from 'lucide-react'

import type { PlanCode } from '@/lib/types'

const PLAN_BADGE: Record<PlanCode, { label: string; bg: string; color: string }> = {
  starter: { label: 'Starter', bg: 'var(--am-blue-bg)',                            color: 'var(--am-blue)'    },
  pro:     { label: 'Pro',     bg: 'var(--am-accent2-bg, rgba(155,135,255,0.12))', color: 'var(--am-accent2)' },
  pro_rag: { label: 'Pro + RAG', bg: 'var(--am-green-bg)',                         color: 'var(--am-green)'   },
}

export interface UpsellBadgeProps {
  /** Plan that unlocks this feature. */
  requires: PlanCode
  /** Optional override of the badge label (defaults to "Upgrade to <Plan>"). */
  label?: string
  /** Compact rendering (no icon, just text). */
  compact?: boolean
  className?: string
}

/**
 * Inline pill that hints a feature requires upgrading to a higher plan.
 *
 * Use next to a CTA, menu item, or section title that the current tenant
 * cannot access. For full-feature gating, prefer `UpsellCard`.
 */
export function UpsellBadge({ requires, label, compact = false, className = '' }: UpsellBadgeProps) {
  const tier = PLAN_BADGE[requires]
  const text = label ?? `Upgrade to ${tier.label}`

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium font-mono ${className}`}
      style={{ background: tier.bg, color: tier.color }}
      title={text}
    >
      {!compact && <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />}
      {compact ? <Lock className="h-2.5 w-2.5" aria-hidden="true" /> : null}
      {text}
    </span>
  )
}
