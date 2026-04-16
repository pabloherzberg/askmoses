import { bestCalls, trainers } from '@/lib/mock-data'
import { BehavioralProfile } from '@/components/shared/BehavioralProfile'
import { CallHighlightCard } from '@/components/shared/CallHighlightCard'
import { ScoreCard } from '@/components/shared/ScoreCard'
import { ScorePill } from '@/components/shared/ScorePill'
import { SectionLabel } from '@/components/shared/SectionLabel'

const trainerKeyMap: Record<string, string> = {
  '00000000-0000-0000-0000-000000000301': 'marcus',
  '00000000-0000-0000-0000-000000000302': 'jamie',
  '00000000-0000-0000-0000-000000000303': 'jordan',
  '00000000-0000-0000-0000-000000000304': 'taylor',
}

const avatarBgMap: Record<string, string> = {
  blue:   'rgba(94,179,255,0.15)',
  purple: 'rgba(110,86,255,0.15)',
  green:  'rgba(34,217,160,0.15)',
  red:    'rgba(255,94,94,0.15)',
  amber:  'rgba(255,171,46,0.15)',
}

const avatarTextMap: Record<string, string> = {
  blue:   'var(--am-blue)',
  purple: 'var(--am-accent2)',
  green:  'var(--am-green)',
  red:    'var(--am-red)',
  amber:  'var(--am-amber)',
}

export default function CoachingPage() {
  return (
    <div>
      <SectionLabel>Coaching Center</SectionLabel>
      <p className="text-sm mb-6" style={{ color: 'var(--am-muted)' }}>
        Best calls of the week — use these as reference material in team training sessions.
      </p>

      {trainers.map((trainer) => {
        const key = trainerKeyMap[trainer.id]
        const calls = bestCalls[key] ?? []

        return (
          <div key={trainer.id} className="mb-10">
            {/* Trainer header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold font-mono flex-shrink-0"
                style={{
                  background: avatarBgMap[trainer.avatarColor],
                  color: avatarTextMap[trainer.avatarColor],
                }}
              >
                {trainer.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold" style={{ color: 'var(--am-text)' }}>
                  {trainer.name}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
                  {trainer.totalCalls} calls · last active {trainer.lastActive}
                </p>
              </div>
              <span
                className="text-[12px] font-mono font-semibold px-2.5 py-0.5 rounded-full border flex-shrink-0"
                style={{
                  color: 'var(--am-green)',
                  borderColor: 'rgba(34,217,160,0.4)',
                  background: 'rgba(34,217,160,0.10)',
                }}
              >
                {trainer.closeRate}% close rate
              </span>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <ScoreCard label="Avg Score"   value={trainer.score}           valueColor="var(--am-accent2)" deltaLabel="this week" />
              <ScoreCard label="Close Rate"  value={`${trainer.closeRate}%`} valueColor="var(--am-green)"   delta={trainer.closeDelta} deltaLabel="delta" />
              <ScoreCard label="Total Calls" value={trainer.totalCalls}      deltaLabel="all time" />
              <ScoreCard label="This Week"   value={trainer.callsThisWeek ?? 0}            deltaLabel="calls processed" />
            </div>

            {/* Behavioral Correlation Profile */}
            <div className="mb-4">
              <BehavioralProfile trainerKey={key} />
            </div>

            {/* Best Call This Week */}
            <div
              className="rounded-2xl p-5 border shadow-md"
              style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
            >
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
                  Best Call This Week
                </p>
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                  style={{
                    color: 'var(--am-amber)',
                    borderColor: 'rgba(255,171,46,0.35)',
                    background: 'rgba(255,171,46,0.08)',
                  }}
                >
                  mock data only
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {calls.map((call) => (
                  <CallHighlightCard key={call.prospect + call.date} call={call} />
                ))}
              </div>

              <p className="mt-4 text-[10px]" style={{ color: 'var(--am-amber)' }}>
                † all values sourced from mock-data.ts — Listen at X:XX → is non-functional in demo
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
