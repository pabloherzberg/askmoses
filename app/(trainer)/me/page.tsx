import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getTrainerById } from '@/lib/services/trainers'
import { getCalls } from '@/lib/services/calls'
import { getRubric } from '@/lib/services/rubric'
import { ScoreCard } from '@/components/shared/ScoreCard'
import { RubricBar } from '@/components/shared/RubricBar'
import { ScorePill } from '@/components/shared/ScorePill'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { getTrainerId } from '@/lib/auth'
import type { RubricColor } from '@/lib/types'

const resultStyles: Record<string, { bg: string; color: string; label: string }> = {
  closed:      { bg: 'var(--am-green-bg)', color: 'var(--am-green)', label: 'Closed' },
  'no-close':  { bg: 'var(--am-red-bg)',   color: 'var(--am-red)',   label: 'No Close' },
  'follow-up': { bg: 'var(--am-amber-bg)', color: 'var(--am-amber)', label: 'Follow-up' },
}

function buildRubricDelta(
  trainerScores: Record<string, number>,
  rubricSections: { id: string; name: string; teamAvg: number; color: RubricColor }[]
) {
  return rubricSections.map((section) => {
    const trainerVal = trainerScores[section.id] ?? 0
    const delta = trainerVal - section.teamAvg
    return {
      id:       section.id,
      name:     section.name,
      color:    section.color,
      value:    trainerVal,
      teamAvg:  section.teamAvg,
      delta,
    }
  })
}

const coachingTips: Record<string, { title: string; body: string }> = {
  'trainer-marcus': {
    title: 'This week\'s focus: Problem Agitation',
    body: 'Your Discovery is the best on the team (94). Now sharpen the next step: after identifying the pain, pause and ask "How long has this been going on?" — let the prospect feel the cost of the problem before you present the offer.',
  },
  'trainer-jamie': {
    title: 'This week\'s focus: Offer Presentation',
    body: 'Your Discovery and Problem Agitation are solid (88). The gap is in translating that emotional momentum into a compelling offer. After the prospect acknowledges the problem, anchor the investment to the cost of inaction — not the features of the program.',
  },
  'trainer-jordan': {
    title: 'This week\'s focus: Problem Agitation',
    body: 'You\'re jumping to the offer too fast. Spend more time letting the prospect feel the weight of the problem — ask "How is this affecting your day-to-day?" before presenting the solution. Agitation builds the urgency that closes deals.',
  },
  'trainer-taylor': {
    title: 'Priority: rebuild confidence in objection handling',
    body: 'Your score dropped 12pts in 2 weeks — the pattern is clear: when a prospect pushes back on price, you go defensive instead of redirecting to value. Try this: "What would it cost you to leave this unsolved for another 3 months?" Let the prospect answer before you say anything.',
  },
}

export default async function TrainerDashboardPage() {
  const trainerId = await getTrainerId()
  if (!trainerId) return null

  const [trainer, allCalls, { sections: rubric }] = await Promise.all([
    getTrainerById(trainerId),
    getCalls({ trainerId }),
    getRubric(),
  ])

  const coachingTip = coachingTips[trainerId] ?? coachingTips['trainer-marcus']

  if (!trainer) return null

  const recentCalls = [...allCalls]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6)

  const rubricWithDelta = buildRubricDelta(
    {
      discovery:         trainer.rubricScores.discovery,
      problemAgitation:  trainer.rubricScores.problemAgitation,
      offerPresentation: trainer.rubricScores.offerPresentation,
      objectionHandling: trainer.rubricScores.objectionHandling,
      closeAndNextSteps: trainer.rubricScores.closeAndNextSteps,
    },
    rubric
  )

  return (
    <div>
      {/* ── Greeting ──────────────────────────────────────────── */}
      <div className="mb-6">
        <SectionLabel>My Dashboard</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          Hello, {trainer.name}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
          Week 6 of 6 · {trainer.totalCalls} calls this cycle
        </p>
      </div>

      {/* ── Personal metrics ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <ScoreCard
          label="My Score"
          value={trainer.score}
          valueColor="var(--am-accent2)"
          delta={trainer.scoreDelta}
          deltaLabel="pts since week 1"
        />
        <ScoreCard
          label="Close Rate"
          value={`${trainer.closeRate}%`}
          valueColor="var(--am-green)"
          delta={trainer.closeDelta}
          deltaLabel="pts since week 1"
        />
      </div>

      {/* ── Main grid: rubric + coaching tip ──────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

        {/* Personal rubric vs team avg */}
        <div
          className="rounded-2xl p-5 border"
          style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
        >
          <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--am-text)' }}>
            My Rubric vs Team Average
          </p>
          <p className="text-xs mb-4" style={{ color: 'var(--am-muted)' }}>
            Green = above team avg · Red = below team avg
          </p>
          <div className="flex flex-col gap-4">
            {rubricWithDelta.map((row) => (
              <div key={row.id}>
                <RubricBar
                  label={row.name}
                  value={row.value}
                  color={row.color}
                />
                <div className="flex justify-between mt-1 pl-[148px]">
                  <span
                    className="text-[10px] font-mono"
                    style={{
                      color: row.delta >= 0 ? 'var(--am-green)' : 'var(--am-red)',
                    }}
                  >
                    {row.delta > 0 ? `+${row.delta}` : row.delta} vs team ({row.teamAvg})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Coaching tip */}
          <div
            className="rounded-2xl p-5 border border-l-4"
            style={{
              background:   'var(--am-bg2)',
              borderColor:  'var(--am-border)',
              borderLeftColor: 'var(--am-accent)',
            }}
          >
            <p className="text-[11px] font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--am-accent2)' }}>
              Coaching Tip
            </p>
            <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--am-text)' }}>
              {coachingTip.title}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--am-muted)' }}>
              {coachingTip.body}
            </p>
          </div>

          {/* Quick stats */}
          <div
            className="rounded-2xl p-5 border"
            style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
          >
            <p className="text-[13px] font-medium mb-3" style={{ color: 'var(--am-text)' }}>
              Quick Stats
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Closed', value: allCalls.filter((c) => c.result === 'closed').length, color: 'var(--am-green)' },
                { label: 'Follow-up', value: allCalls.filter((c) => c.result === 'follow-up').length, color: 'var(--am-amber)' },
                { label: 'No Close', value: allCalls.filter((c) => c.result === 'no-close').length, color: 'var(--am-red)' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p className="text-2xl font-semibold font-mono" style={{ color }}>
                    {value}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--am-muted)' }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent calls ──────────────────────────────────────── */}
      <SectionLabel>Recent Calls</SectionLabel>
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        {recentCalls.map((call, i) => {
          const result = resultStyles[call.result]
          return (
            <Link
              key={call.id}
              href={`/me/calls/${call.id}`}
              className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--am-bg3)]"
              style={{
                borderBottom: i < recentCalls.length - 1 ? '1px solid var(--am-border)' : 'none',
              }}
            >
              {/* Date */}
              <span className="text-xs font-mono w-20 flex-shrink-0" style={{ color: 'var(--am-muted)' }}>
                {new Date(call.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>

              {/* Prospect */}
              <span className="flex-1 text-sm truncate" style={{ color: 'var(--am-text)' }}>
                {call.prospect}
              </span>

              {/* Duration */}
              <span className="text-xs font-mono hidden sm:block" style={{ color: 'var(--am-muted)' }}>
                {call.duration}
              </span>

              {/* Result badge */}
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded-full font-mono flex-shrink-0"
                style={{ background: result.bg, color: result.color }}
              >
                {result.label}
              </span>

              {/* Score */}
              <ScorePill score={call.score} />

              <ChevronRight size={15} style={{ color: 'var(--am-muted)', flexShrink: 0 }} />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
