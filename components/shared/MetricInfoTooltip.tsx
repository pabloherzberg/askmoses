'use client'

import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface MetricInfoTooltipProps {
  /** Texto do hover. Já traduzido — o componente não chama useTranslations. */
  text: string
  size?: number
}

// Ícone (i) com hover explicando como uma métrica é calculada. Client component
// isolado para que os cards que o usam (ScoreCard) sigam sendo server components.
//
// Diferente de InfoTooltip, que é o balão "O que mudou" com visual próprio —
// aqui o conteúdo é só o texto passado, sem cabeçalho fixo.
export function MetricInfoTooltip({ text, size = 13 }: MetricInfoTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center"
          style={{ cursor: 'help', color: 'var(--am-muted)' }}
          aria-label={text}
        >
          <Info size={size} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={5} className="max-w-[260px]">
        <p className="text-xs leading-relaxed">{text}</p>
      </TooltipContent>
    </Tooltip>
  )
}
