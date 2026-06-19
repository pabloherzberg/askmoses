'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Info, ChevronDown } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { IntentSignal, IntentBreakdown } from '@/lib/types'
import { computeIntentIndex } from '@/lib/utils/intentScore'

interface IntentBreakdownProps {
  signals: IntentSignal[]
  scores: IntentBreakdown
  variant?: 'compact' | 'detailed' | 'accordion'
  className?: string
  showTitle?: boolean
}

export function IntentBreakdownComponent({
  signals,
  scores,
  variant = 'compact',
  className = '',
  showTitle = true,
}: IntentBreakdownProps) {
  const t = useTranslations('Intent')
  const [expandedSignals, setExpandedSignals] = useState<Set<string>>(new Set())

  const toggleExpand = (signalId: string) => {
    const newExpanded = new Set(expandedSignals)
    if (newExpanded.has(signalId)) {
      newExpanded.delete(signalId)
    } else {
      newExpanded.add(signalId)
    }
    setExpandedSignals(newExpanded)
  }

  const signalOrder = ['financial', 'urgency', 'authority', 'engagement']
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0)

  // Build weights object for calculation
  const weights = {
    financial: signals.find((s) => s.id === 'financial')?.weight || 4,
    urgency: signals.find((s) => s.id === 'urgency')?.weight || 3,
    authority: signals.find((s) => s.id === 'authority')?.weight || 2,
    engagement: signals.find((s) => s.id === 'engagement')?.weight || 1,
  }

  const intentIndex = computeIntentIndex(scores, weights)
  const displayScore = intentIndex.toFixed(1)

  return (
    <div className={`rounded-2xl p-5 border shadow-md ${className}`} style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}>
      {showTitle && (
        <div className="mb-6">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
              {t('sectionLabel')}
            </p>
            <span className="text-3xl font-bold font-mono" style={{ color: 'var(--am-green)' }}>
              {displayScore}
            </span>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
            {t('subtitle')}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {signalOrder.map((signalId) => {
          const signal = signals.find((s) => s.id === signalId)
          if (!signal) return null

          const rawScore = scores[signalId as keyof IntentBreakdown]
          // Formula: (score × weight) / 10 / 2
          const contribution = (rawScore * signal.weight) / 10 / 2
          // Max possible for this signal
          const maxValue = (10 * signal.weight) / 10 / 2
          // Bar fill percentage
          const percentage = (contribution / maxValue) * 100

          // Display value with max 2 decimals, remove trailing zeros
          const displayValue = contribution.toLocaleString('en-US', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 2
          })
          const maxValueDisplay = maxValue.toLocaleString('en-US', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 2
          })
          const formulaExplanation = `(${rawScore} × ${signal.weight}) / 10 / 2 = ${displayValue}`
          const scoreWithMax = `${displayValue}/${maxValueDisplay}`

          const signalName = t(`signals.${signalId}.name`)
          const signalQuestion = t(`signals.${signalId}.question`)
          const signalDescription = t(`signals.${signalId}.description`)

          const isExpanded = expandedSignals.has(signal.id)

          if (variant === 'accordion') {
            return (
              <div
                key={signal.id}
                onClick={() => toggleExpand(signal.id)}
                className="rounded-lg border p-3 cursor-pointer transition-all"
                style={{
                  background: isExpanded ? 'var(--am-bg3)' : 'var(--am-bg2)',
                  borderColor: 'var(--am-border)',
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[12px] font-medium" style={{ color: 'var(--am-text)' }}>
                      {signalName}
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Info size={14} style={{ color: 'var(--am-muted)', cursor: 'help' }} />
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={5} className="max-w-xs">
                          <div className="space-y-2">
                            <p className="font-semibold text-sm">{signalName}</p>
                            <p className="text-xs font-medium" style={{ color: 'var(--am-green)' }}>
                              {formulaExplanation}
                            </p>
                            <p className="text-xs font-mono font-semibold" style={{ color: 'var(--am-green)' }}>
                              {scoreWithMax}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--am-muted)' }}>
                              Weight: {signal.weight} ({((signal.weight / totalWeight) * 100).toFixed(0)}%)
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <ChevronDown
                      size={16}
                      style={{
                        color: 'var(--am-muted)',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                      }}
                    />
                  </div>
                  <span className="text-[12px] font-mono font-semibold" style={{ color: 'var(--am-green)' }}>
                    {displayValue}
                  </span>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--am-bg4)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        background: `var(--am-${signal.color === 'accent2' ? 'accent2' : signal.color})`,
                        width: `${percentage}%`,
                      }}
                    />
                  </div>
                </div>

                {isExpanded && (
                  <div className="space-y-2 text-[11px] pt-2 border-t" style={{ borderColor: 'var(--am-border)', color: 'var(--am-muted)' }}>
                    <p className="font-medium" style={{ color: 'var(--am-text)' }}>
                      {signalQuestion}
                    </p>
                    <p>{signalDescription}</p>
                  </div>
                )}
              </div>
            )
          }

          return (
            <div key={signal.id}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2 cursor-help flex-1 min-w-0">
                        <span className="text-[12px] font-medium" style={{ color: 'var(--am-text)' }}>
                          {signalName}
                        </span>
                        <Info size={14} style={{ color: 'var(--am-muted)' }} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={5} className="max-w-xs">
                      <div className="space-y-2">
                        <p className="font-semibold text-sm">{signalName}</p>
                        <p className="text-xs font-medium" style={{ color: 'var(--am-green)' }}>
                          {formulaExplanation}
                        </p>
                        <p className="text-xs font-mono font-semibold" style={{ color: 'var(--am-green)' }}>
                          {scoreWithMax}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--am-muted)' }}>
                          Weight: {signal.weight} ({((signal.weight / totalWeight) * 100).toFixed(0)}%)
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono" style={{ color: 'var(--am-muted)' }}>
                    {displayValue}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--am-bg4)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      background: `var(--am-${signal.color === 'accent2' ? 'accent2' : signal.color})`,
                      width: `${percentage}%`,
                    }}
                  />
                </div>
              </div>

              {variant === 'detailed' && (
                <div className="mt-3 space-y-1 text-[11px]" style={{ color: 'var(--am-muted)' }}>
                  <p className="font-medium" style={{ color: 'var(--am-text)' }}>
                    {signalQuestion}
                  </p>
                  <p>{signalDescription}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
