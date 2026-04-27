import Link from 'next/link'
import { Sparkles } from 'lucide-react'

import type { PlanCode } from '@/lib/types'

function isExternalHref(href: string): boolean {
  return /^(?:https?:)?\/\//i.test(href) || /^(?:mailto:|tel:)/i.test(href)
}

const PLAN_META: Record<PlanCode, { label: string; accent: string; bg: string }> = {
  starter: { label: 'Starter',   accent: 'var(--am-blue)',    bg: 'var(--am-blue-bg)'  },
  pro:     { label: 'Pro',       accent: 'var(--am-accent2)', bg: 'var(--am-accent2-bg, rgba(155,135,255,0.12))' },
  pro_rag: { label: 'Pro + RAG', accent: 'var(--am-green)',   bg: 'var(--am-green-bg)' },
}

export interface UpsellCardProps {
  requires: PlanCode
  title: string
  description: string
  ctaLabel?: string
  ctaHref?: string
  className?: string
}

/**
 * Full-width callout card that shows a plan-locked feature with a CTA to
 * upgrade. Use as a section wrapper or below a feature heading when the
 * feature itself is gated (vs. just decorating an item — for that use
 * `UpsellBadge`).
 */
export function UpsellCard({
  requires,
  title,
  description,
  ctaLabel = 'See plans',
  ctaHref = '/#pricing',
  className = '',
}: UpsellCardProps) {
  const meta = PLAN_META[requires]

  return (
    <div
      className={`rounded-xl border p-5 ${className}`}
      style={{
        background: meta.bg,
        borderColor: meta.accent,
        borderStyle: 'dashed',
        borderWidth: '1px',
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'var(--am-bg2)', color: meta.accent }}
        >
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--am-text)' }}>
              {title}
            </h3>
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-full"
              style={{ background: 'var(--am-bg2)', color: meta.accent, border: `1px solid ${meta.accent}` }}
            >
              {meta.label}
            </span>
          </div>
          <p className="text-xs mt-1.5" style={{ color: 'var(--am-muted)' }}>
            {description}
          </p>
        </div>
        {isExternalHref(ctaHref) ? (
          <a
            href={ctaHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors whitespace-nowrap"
            style={{ background: meta.accent, color: 'var(--am-bg)' }}
          >
            {ctaLabel}
          </a>
        ) : (
          <Link
            href={ctaHref}
            className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors whitespace-nowrap"
            style={{ background: meta.accent, color: 'var(--am-bg)' }}
          >
            {ctaLabel}
          </Link>
        )}
      </div>
    </div>
  )
}
