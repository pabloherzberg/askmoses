'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, ArrowUpRight, AlertTriangle } from 'lucide-react'
import { RubricBar } from '@/components/shared/RubricBar'
import { RESULT_STYLES, DEFAULT_RESULT_STYLE, LEAD_SOURCE_LABELS } from '@/lib/constants'
import type { Call, Role, RubricColor } from '@/lib/types'

const rubricFields: { key: keyof Call['rubricScores']; labelKey: string; color: RubricColor }[] = [
  { key: 'discovery',         labelKey: 'discovery',         color: 'blue' },
  { key: 'problemAgitation',  labelKey: 'problemAgitation',  color: 'amber' },
  { key: 'offerPresentation', labelKey: 'offerPresentation', color: 'green' },
  { key: 'objectionHandling', labelKey: 'objectionHandling', color: 'red' },
  { key: 'closeAndNextSteps', labelKey: 'closeAndNextSteps', color: 'accent2' },
]

const SECTION_COLORS: RubricColor[] = ['blue', 'amber', 'green', 'red', 'accent2']

function scoreColor(score: number) {
  if (score >= 4.25) return 'var(--am-green)'
  if (score >= 3.75) return 'var(--am-amber)'
  return 'var(--am-red)'
}

interface CallDetailProps {
  call: Call
  viewerRole: Role
  backHref: string
}

export function CallDetail({ call, viewerRole, backHref }: CallDetailProps) {
  const t = useTranslations('Shared.callDetail')
  const tRubric = useTranslations('Shared.rubric')
  const tOutcomes = useTranslations('Shared.outcomes')
  const locale = useLocale()
  const [expanded, setExpanded] = useState(false)
  const result = RESULT_STYLES[call.result] ?? DEFAULT_RESULT_STYLE
  const outcomeLabel = call.result in RESULT_STYLES
    ? tOutcomes(`short.${call.result}`)
    : tOutcomes('unknown')

  const transcriptLines = call.transcript.split('\n')
  const showAll = expanded || transcriptLines.length <= 4
  const visibleLines = showAll ? transcriptLines : transcriptLines.slice(0, 4)

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
            · {call.duration} · {call.prospect}
          </p>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--am-text)' }}>
            {call.trainerName}
          </h1>
          {(call.lead_name || call.lead_source) && (
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
            </div>
          )}
        </div>

        {/* Score + result */}
        <div className="flex items-center gap-3">
          <span
            className="text-5xl font-semibold font-mono leading-none"
            style={{ color: scoreColor(call.score) }}
          >
            {call.score.toFixed(1)}
          </span>
          <span
            className="text-xs font-medium px-2.5 py-1 rounded-full font-mono"
            style={{ background: result.bg, color: result.color }}
          >
            {outcomeLabel}
          </span>
        </div>
      </div>

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
          {call.sections && call.sections.length > 0 ? (
            <div className="flex flex-col gap-4">
              {call.sections.map((section, i) => {
                const isCriticalAlert = section.critical && section.score <= 2
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
                      max={5}
                      color={color}
                    />
                    <p className="text-[11px] mt-1 ml-[156px] leading-relaxed" style={{ color: 'var(--am-muted)' }}>
                      {section.feedback}
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

        {/* Strengths + improvements */}
        <div className="flex flex-col gap-4">
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
      </div>

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
