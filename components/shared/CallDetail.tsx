'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, ArrowUpRight } from 'lucide-react'
import { RubricBar } from '@/components/shared/RubricBar'
import type { Call, Role, RubricColor } from '@/lib/types'

const resultStyles: Record<string, { bg: string; color: string; label: string }> = {
  closed: { bg: 'var(--am-green-bg)', color: 'var(--am-green)', label: 'Closed' },
  'no-close': { bg: 'var(--am-red-bg)', color: 'var(--am-red)', label: 'No Close' },
  'follow-up': { bg: 'var(--am-amber-bg)', color: 'var(--am-amber)', label: 'Follow-up' },
}

const rubricFields: { key: keyof Call['rubricScores']; label: string; color: RubricColor }[] = [
  { key: 'discovery', label: 'Discovery', color: 'blue' },
  { key: 'problemAgitation', label: 'Problem Agitation', color: 'amber' },
  { key: 'offerPresentation', label: 'Offer Presentation', color: 'green' },
  { key: 'objectionHandling', label: 'Objection Handling', color: 'red' },
  { key: 'closeAndNextSteps', label: 'Close & Next Steps', color: 'accent2' },
]

function scoreColor(score: number) {
  if (score >= 85) return 'var(--am-green)'
  if (score >= 75) return 'var(--am-amber)'
  return 'var(--am-red)'
}

interface CallDetailProps {
  call: Call
  viewerRole: Role
  backHref: string
}

export function CallDetail({ call, viewerRole, backHref }: CallDetailProps) {
  const [expanded, setExpanded] = useState(false)
  const result = resultStyles[call.result]

  const transcriptLines = call.transcript.split('\n')
  const showAll = expanded || transcriptLines.length <= 4
  const visibleLines = showAll ? transcriptLines : transcriptLines.slice(0, 4)

  return (
    <div>
      {/* Back */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm mb-6 transition-opacity hover:opacity-70"
        style={{ color: 'var(--am-muted)' }}
      >
        <ArrowLeft size={15} />
        Back
      </Link>

      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--am-muted)' }}>
            {new Date(call.date).toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            })}{' '}
            · {call.duration} · {call.prospect}
          </p>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--am-text)' }}>
            {call.trainerName}
          </h1>
        </div>

        {/* Score + result */}
        <div className="flex items-center gap-3">
          <span
            className="text-5xl font-semibold font-mono leading-none"
            style={{ color: scoreColor(call.score) }}
          >
            {call.score}
          </span>
          <span
            className="text-xs font-medium px-2.5 py-1 rounded-full font-mono"
            style={{ background: result.bg, color: result.color }}
          >
            {result.label}
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
            Rubric Scores
          </p>
          <div className="flex flex-col gap-3">
            {rubricFields.map(({ key, label, color }) => (
              <RubricBar
                key={key}
                label={label}
                value={call.rubricScores[key]}
                color={color}
              />
            ))}
          </div>
        </div>

        {/* Strengths + improvements */}
        <div className="flex flex-col gap-4">
          <div
            className="rounded-2xl p-5 border"
            style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
          >
            <p className="text-[13px] font-medium mb-3" style={{ color: 'var(--am-text)' }}>
              Strengths
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
              Areas to Improve
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
          Transcript
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
            {expanded ? 'Show less ↑' : 'Show more ↓'}
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
            Coaching Notes
          </p>
          <p className="text-xs mb-3" style={{ color: 'var(--am-muted)' }}>
            Internal notes — not visible to the trainer.
          </p>
          <textarea
            rows={4}
            placeholder="Add your coaching notes here..."
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
            Notes are not persisted in this demo.
          </p>
        </div>
      )}
    </div>
  )
}
