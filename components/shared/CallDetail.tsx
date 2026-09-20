'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, ArrowUpRight, AlertTriangle, FileText, Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { RubricBar } from '@/components/shared/RubricBar'
import { IntentBreakdownComponent } from '@/components/shared/IntentBreakdown'
import { Stage2Marker } from '@/components/shared/Stage2Marker'
import { formatDuration } from '@/lib/format'
import { RESULT_STYLES, DEFAULT_RESULT_STYLE, LEAD_SOURCE_LABELS } from '@/lib/constants'
import { sectionFeedbackFallback } from '@/lib/mock-data'
import { scoreColorVar, toDisplay5, feedbackTier } from '@/lib/score-display'
import { resolveIntentWeights } from '@/lib/utils/intentScore'
import { callState, showsEvaluation, canReprocess, type CallState } from '@/lib/call-state'
import { ReprocessButton } from '@/components/shared/ReprocessButton'
import type { Call, Role, RubricColor, IntentSignal } from '@/lib/types'

const rubricFields: { key: keyof Call['rubricScores']; labelKey: string; color: RubricColor }[] = [
  { key: 'discovery', labelKey: 'discovery', color: 'blue' },
  { key: 'problemAgitation', labelKey: 'problemAgitation', color: 'amber' },
  { key: 'offerPresentation', labelKey: 'offerPresentation', color: 'green' },
  { key: 'objectionHandling', labelKey: 'objectionHandling', color: 'red' },
  { key: 'closeAndNextSteps', labelKey: 'closeAndNextSteps', color: 'accent2' },
]

const SECTION_COLORS: RubricColor[] = ['blue', 'amber', 'green', 'red', 'accent2']

const GREEN_BG = 'var(--am-green-bg, rgba(34,217,160,0.12))'

/**
 * Qual frase explica a ausência de avaliação.
 *
 * Separada por MOTIVO porque os motivos são acionáveis de formas diferentes:
 * "não houve gravação" é definitivo, "falhou a transcrição" pode ser
 * reprocessado, e "não era conversa de venda" é o sistema tendo acertado ao
 * não medir — não é falha nenhuma.
 */
function stateMessageKey(state: CallState, processingStatus: string | null): string {
  if (state === 'not_sales') return 'stateNotSalesCall'
  if (state === 'analyzing') return 'stateAnalyzing'
  if (processingStatus === 'no_recording') return 'stateNoRecording'
  if (processingStatus === 'transcription_failed') return 'stateTranscriptionFailed'
  return 'stateUnavailable'
}

interface CallDetailProps {
  call: Call
  viewerRole: Role
  backHref: string
  intentSignals?: IntentSignal[]
}

export function CallDetail({ call, viewerRole, backHref, intentSignals = [] }: CallDetailProps) {
  const t = useTranslations('Shared.callDetail')
  const tRubric = useTranslations('Shared.rubric')
  const tOutcomes = useTranslations('Shared.outcomes')
  const tIntent = useTranslations('Intent')
  const locale = useLocale()
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const result = RESULT_STYLES[call.result] ?? DEFAULT_RESULT_STYLE
  const outcomeLabel = call.result in RESULT_STYLES
    ? tOutcomes(`short.${call.result}`)
    : tOutcomes('unknown')

  const transcriptLines = call.transcript.split('\n')
  const showAll = expanded || transcriptLines.length <= 4
  const visibleLines = showAll ? transcriptLines : transcriptLines.slice(0, 4)

  // Em que estado esta call está (lib/call-state.ts). Os blocos de avaliação —
  // score, pill de desfecho, rubrica, intent, strengths — só aparecem quando há
  // medição real. Antes, uma call recém-chegada mostrava rubrica 0.0 nas cinco
  // seções, Intent Index fabricado e a pill vermelha "Not Closed": três
  // afirmações sobre uma conversa que ninguém avaliou.
  const state = callState(call)
  const showsEval = showsEvaluation(state)

  // Sem fallback sintético. `deriveIntentBreakdownForCall` devolvia 5 fixo nos
  // quatro sinais ignorando os parâmetros, e era daí que saía o Intent Index
  // 2.5. Ausência de breakdown agora significa ausência: o bloco não renderiza.
  const intentBreakdown =
    call.intentBreakdown && typeof call.intentBreakdown === 'object' ? call.intentBreakdown : null

  // Use stored weights from analysis time, fallback to current org weights.
  // O índice é invariante à base: snapshots antigos (base 10) seguem corretos.
  const storedWeights = call.intentWeights
  const currentWeights = resolveIntentWeights(intentSignals)
  const weights = storedWeights || currentWeights

  // If weights are from history, update signals to reflect them
  const signalsWithHistoricalWeights = storedWeights
    ? intentSignals.map(s => ({
        ...s,
        weight: storedWeights[s.id as keyof typeof storedWeights] || s.weight,
      }))
    : intentSignals

  const finalIntentBreakdown = intentBreakdown

  return (
    <div>
      {/* Back */}
      <Link
        href={`/${locale}${backHref}`}
        className="inline-flex items-center gap-1.5 text-sm mb-6 transition-opacity hover:opacity-70"
        style={{ color: 'var(--am-muted)' }}
      >
        <ArrowLeft size={15} />
        {t('back')}
      </Link>

      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--am-muted)' }}>
            {new Date(call.date).toLocaleDateString(locale, {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            })}{' '}
            · {formatDuration(call.durationSeconds)} · {call.prospect}
          </p>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--am-text)' }}>
            {call.trainerName}
          </h1>
          {(call.lead_name || call.lead_source || call.scriptName) && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {call.lead_name && (
                <span className="text-xs" style={{ color: 'var(--am-muted)' }}>
                  {t('leadName')}: <span style={{ color: 'var(--am-text)' }}>{call.lead_name}</span>
                </span>
              )}
              {call.lead_source && (
                <span
                  className="text-[11px] font-mono px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--am-bg4)', color: 'var(--am-accent2)' }}
                >
                  {LEAD_SOURCE_LABELS[call.lead_source]}
                </span>
              )}
              {call.scriptName && (
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={
                    call.scriptIsActive
                      ? { background: GREEN_BG, color: 'var(--am-green)' }
                      : { background: 'var(--am-bg4)', color: 'var(--am-muted)' }
                  }
                  title={t('scriptUsed')}
                >
                  <FileText size={11} />
                  {call.scriptName}
                  {call.scriptVersion && (
                    <span className="font-mono" style={{ opacity: 0.75 }}>
                      · {call.scriptVersion}
                    </span>
                  )}
                  {/* Strict check: só marca "legacy" quando a comparação
                      retornou explicitamente false. undefined = enrichment
                      não rodou / lookup falhou → não inferir legado. */}
                  {call.scriptIsActive === false && (
                    <span style={{ opacity: 0.7 }}>· {t('legacyScriptHint')}</span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Score + result. A pill sai junto do score de propósito: call_outcome
            NULL vira 'not_closed' no mapper (lib/services/calls.ts), então numa
            call sem análise a pill afirmaria um desfecho que nenhuma análise
            inferiu. */}
        {showsEval && (
          <div className="flex items-center gap-3">
            <span
              className="text-5xl font-semibold font-mono leading-none"
              style={{ color: scoreColorVar(call.score) }}
            >
              {toDisplay5(call.score)}
            </span>
            <span
              className="text-xs font-medium px-2.5 py-1 rounded-full font-mono"
              style={{ background: result.bg, color: result.color }}
            >
              {outcomeLabel}
            </span>
          </div>
        )}
      </div>

      {/* Stage 2 (Actual Close / paying client) — owner/admin only. Separado
          do Initial Result (Stage 1, badge acima). */}
      {(viewerRole === 'owner' || viewerRole === 'admin') && (
        <Stage2Marker callId={call.id} initial={call.stage2Outcome ?? null} />
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

        {/* Rubric scores */}
        <div
          className="rounded-2xl p-5 border"
          style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
        >
          <p className="text-[13px] font-medium mb-4" style={{ color: 'var(--am-text)' }}>
            {t('rubricScores')}
          </p>
          {!showsEval ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--am-muted)' }}>
                {t(stateMessageKey(state, call.processingStatus ?? null))}
              </p>
              {/* A ação aparece só onde faz sentido (canReprocess): falha de
                  pipeline. Dizer "não foi possível transcrever" e não oferecer
                  a ação seria mandar a pessoa procurar a call na tabela. */}
              {(viewerRole === 'owner' || viewerRole === 'admin') && canReprocess(call) && (
                <ReprocessButton
                  callId={call.id}
                  hasSections={Array.isArray(call.sections) && call.sections.length > 0}
                  onRefresh={() => router.refresh()}
                />
              )}
            </div>
          ) : call.sections && call.sections.length > 0 ? (
            <div className="flex flex-col gap-4">
              {call.sections.map((section, i) => {
                const isCriticalAlert = section.critical && section.score <= 40
                const color = SECTION_COLORS[i % SECTION_COLORS.length]
                return (
                  <div key={section.name}>
                    {isCriticalAlert && (
                      <div
                        className="flex items-start gap-2 text-xs rounded-lg px-3 py-2 mb-2"
                        style={{ background: 'rgba(255,94,94,0.1)', color: 'var(--am-red)' }}
                      >
                        <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                        <span>Critical section — needs immediate attention</span>
                      </div>
                    )}
                    <RubricBar
                      label={section.name}
                      value={section.score}
                      color={color}
                    />
                    <p className="text-[11px] mt-1 ml-[156px] leading-relaxed" style={{ color: 'var(--am-muted)' }}>
                      {section.feedback || (() => {
                        const nameLower = section.name.toLowerCase()
                        const tiers = Object.entries(sectionFeedbackFallback).find(([k]) => nameLower.includes(k))?.[1]
                        if (!tiers) return null
                        return tiers[feedbackTier(section.score)]
                      })()}
                    </p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {rubricFields.map(({ key, labelKey, color }) => (
                <RubricBar
                  key={key}
                  label={tRubric(labelKey)}
                  value={call.rubricScores[key]}
                  color={color}
                />
              ))}
            </div>
          )}
        </div>

        {/* Ask Moses Intent Index — só com breakdown real gravado pela análise. */}
        {showsEval && finalIntentBreakdown && signalsWithHistoricalWeights.length > 0 && (
          <IntentBreakdownComponent
            signals={signalsWithHistoricalWeights}
            scores={finalIntentBreakdown}
            variant="detailed"
            showTitle={true}
          />
        )}
      </div>

      {/* Strengths + improvements — são saída da análise; sem ela, listas vazias
          rotuladas "Strengths" sugeririam que a IA não achou nenhum ponto forte. */}
      {showsEval && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div
          className="rounded-2xl p-5 border"
          style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
        >
          <p className="text-[13px] font-medium mb-3" style={{ color: 'var(--am-text)' }}>
            {t('strengths')}
          </p>
          <ul className="flex flex-col gap-2">
            {call.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                <CheckCircle
                  size={14}
                  className="flex-shrink-0 mt-0.5"
                  style={{ color: 'var(--am-green)' }}
                />
                <span style={{ color: 'var(--am-text)' }}>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="rounded-2xl p-5 border"
          style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
        >
          <p className="text-[13px] font-medium mb-3" style={{ color: 'var(--am-text)' }}>
            {t('areasToImprove')}
          </p>
          <ul className="flex flex-col gap-2">
            {call.improvements.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                <ArrowUpRight
                  size={14}
                  className="flex-shrink-0 mt-0.5"
                  style={{ color: 'var(--am-amber)' }}
                />
                <span style={{ color: 'var(--am-text)' }}>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      )}

      {/* Transcript */}
      <div
        className="rounded-2xl p-5 border mb-4"
        style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
      >
        <p className="text-[13px] font-medium mb-3" style={{ color: 'var(--am-text)' }}>
          {t('transcript')}
        </p>
        <div
          className="text-xs leading-relaxed font-mono rounded-lg p-4"
          style={{ background: 'var(--am-bg3)', color: 'var(--am-text)' }}
        >
          {visibleLines.map((line, i) => (
            <p key={i} className={i > 0 ? 'mt-2' : ''}>{line}</p>
          ))}
        </div>
        {transcriptLines.length > 4 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-xs transition-opacity hover:opacity-70"
            style={{ color: 'var(--am-accent2)' }}
          >
            {expanded ? t('showLess') : t('showMore')}
          </button>
        )}
      </div>

      {/* Coaching notes — owner/admin only */}
      {(viewerRole === 'owner' || viewerRole === 'admin') && (
        <div
          className="rounded-2xl p-5 border"
          style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
        >
          <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--am-text)' }}>
            {t('coachingNotes')}
          </p>
          <p className="text-xs mb-3" style={{ color: 'var(--am-muted)' }}>
            {t('coachingNotesSubtitle')}
          </p>
          <textarea
            rows={4}
            placeholder={t('coachingNotesPlaceholder')}
            className="w-full text-sm rounded-lg px-3 py-2.5 resize-none outline-none border transition-colors"
            style={{
              background: 'var(--am-bg3)',
              borderColor: 'var(--am-border2)',
              color: 'var(--am-text)',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--am-accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--am-border2)')}
          />
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--am-muted)' }}>
            {t('coachingNotesFooter')}
          </p>
        </div>
      )}
    </div>
  )
}
