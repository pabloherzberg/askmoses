'use client'

import { useLocale } from 'next-intl'
import { Info } from 'lucide-react'
import { intentFeedback } from '@/lib/utils/intentFeedback'
import type { IntentScore } from '@/lib/types'

interface IntentCellProps {
  score: IntentScore
}

// Célula da coluna Intent em /calls: exibe apenas o número (1–5) + um ícone de
// tooltip. Sem estrelas, sem badge colorido (decisão Task C). A mensagem do
// tooltip vem de intentFeedback() — fonte única compartilhada com o coaching
// email, então tooltip e email nunca divergem.
export function IntentCell({ score }: IntentCellProps) {
  const locale = useLocale()
  const message = intentFeedback(score, locale)

  return (
    <span className="relative inline-flex items-center gap-1.5 group">
      <span className="text-[13px] font-mono" style={{ color: 'var(--am-text)' }}>
        {score}
      </span>
      <Info
        size={13}
        className="cursor-default"
        style={{ color: 'var(--am-muted)' }}
        aria-label={message}
      />
      <span
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-xl px-3 py-2.5 text-[11px] leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 whitespace-normal"
        style={{
          background: 'var(--am-bg3)',
          border: '1px solid var(--am-border)',
          color: 'var(--am-muted)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}
      >
        {message}
        {/* arrow */}
        <span
          className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent"
          style={{ borderTopColor: 'var(--am-border)' }}
        />
      </span>
    </span>
  )
}
