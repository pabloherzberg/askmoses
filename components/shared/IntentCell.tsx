'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale } from 'next-intl'
import { Info } from 'lucide-react'
import { intentFeedback } from '@/lib/utils/intentFeedback'
import type { IntentScore } from '@/lib/types'

interface IntentCellProps {
  score: IntentScore
}

const TOOLTIP_WIDTH = 256 // w-64
const GAP = 8 // distância vertical do ícone
const VIEWPORT_PADDING = 8 // respiro mínimo nas bordas do viewport
const FLIP_THRESHOLD = 140 // se o ícone está a < Npx do topo, abre pra baixo

interface Coords {
  top: number
  left: number
  placement: 'top' | 'bottom'
}

// Célula da coluna Intent em /calls: exibe apenas o número (1–5) + um ícone de
// tooltip. Sem estrelas, sem badge colorido (decisão Task C). A mensagem do
// tooltip vem de intentFeedback() — fonte única compartilhada com o coaching
// email, então tooltip e email nunca divergem.
//
// O tooltip é renderizado num PORTAL com position:fixed (fora da tabela) pra
// não ser cortado pelo overflow do container — antes, na 1ª linha, o texto
// longo estourava o topo da tabela e era clipado. A posição é calculada a
// partir do bounding rect do ícone, com flip pra baixo perto do topo e clamp
// horizontal no viewport.
export function IntentCell({ score }: IntentCellProps) {
  const locale = useLocale()
  const message = intentFeedback(score, locale)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [coords, setCoords] = useState<Coords | null>(null)

  const computeCoords = useCallback((): Coords | null => {
    const el = triggerRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const centerX = r.left + r.width / 2
    const left = Math.max(
      VIEWPORT_PADDING,
      Math.min(
        centerX - TOOLTIP_WIDTH / 2,
        window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING,
      ),
    )
    // Perto do topo do viewport → abre pra baixo pra não cortar o texto.
    const placement: 'top' | 'bottom' = r.top < FLIP_THRESHOLD ? 'bottom' : 'top'
    const top = placement === 'top' ? r.top - GAP : r.bottom + GAP
    return { top, left, placement }
  }, [])

  // Calcula a posição ANTES de abrir (evita flicker em {0,0}).
  const show = useCallback(() => {
    const c = computeCoords()
    if (c) setCoords(c)
  }, [computeCoords])

  const hide = useCallback(() => setCoords(null), [])

  // Enquanto aberto, recalcula em scroll/resize — sem isso o tooltip "descola"
  // do ícone ao rolar a tabela ou a página.
  useEffect(() => {
    if (!coords) return
    const update = () => {
      const c = computeCoords()
      if (c) setCoords(c)
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [coords, computeCoords])

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[13px] font-mono" style={{ color: 'var(--am-text)' }}>
        {score}
      </span>
      <span
        ref={triggerRef}
        tabIndex={0}
        role="img"
        aria-label={message}
        className="inline-flex cursor-default focus:outline-none"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <Info size={13} style={{ color: 'var(--am-muted)' }} />
      </span>

      {coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[1000] w-64 rounded-xl px-3 py-2.5 text-[11px] leading-relaxed whitespace-normal"
            style={{
              top: coords.top,
              left: coords.left,
              transform: coords.placement === 'top' ? 'translateY(-100%)' : 'none',
              background: 'var(--am-bg3)',
              border: '1px solid var(--am-border)',
              color: 'var(--am-muted)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            {message}
          </span>,
          document.body,
        )}
    </span>
  )
}
