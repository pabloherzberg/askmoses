import { getTrainers } from '@/lib/services/trainers'
import { getInsights } from '@/lib/services/insights'
import { getRubric } from '@/lib/services/rubric'
import { ScoreCard } from '@/components/shared/ScoreCard'
import { ScorePill } from '@/components/shared/ScorePill'
import { RubricBar } from '@/components/shared/RubricBar'
import { AlertItem } from '@/components/shared/AlertItem'
import { InsightCard } from '@/components/shared/InsightCard'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { TrendChart } from './TrendChart'

const avatarBgMap: Record<string, string> = {
  blue: 'var(--am-blue-bg)',
  purple: 'rgba(110,86,255,0.15)',
  green: 'var(--am-green-bg)',
  red: 'var(--am-red-bg)',
}

const avatarTextMap: Record<string, string> = {
  blue: 'var(--am-blue)',
  purple: 'var(--am-accent2)',
  green: 'var(--am-green)',
  red: 'var(--am-red)',
}

const alerts = [
  { dotColor: 'red' as const, text: "Taylor's score dropped 12pts this week", actionLabel: 'Review' },
  { dotColor: 'amber' as const, text: 'Taylor has had no calls in 3 days', actionLabel: 'Contact' },
  { dotColor: 'green' as const, text: 'Marcus hit 74% — best close rate on the team', actionLabel: 'Celebrate' },
  { dotColor: 'blue' as const, text: '3 trainers are skipping objection handling', actionLabel: 'Train' },
]

export default async function OverviewPage() {
  const [trainers, insights, { sections: rubric, trend }] = await Promise.all([
    getTrainers(),
    getInsights(),
    getRubric(),
  ])

  const sorted = [...trainers].sort((a, b) => b.score - a.score)
  const totalCalls = trainers.reduce((s, t) => s + t.totalCalls, 0)
  const avgClose = Math.round(trainers.reduce((s, t) => s + t.closeRate, 0) / trainers.length)
  const avgScore = Math.round(trainers.reduce((s, t) => s + t.score, 0) / trainers.length)
  const topTrainer = sorted[0]

  return (
    <div>
      {/* ── Team overview ─────────────────────────────────────── */}
      <SectionLabel>Team Overview</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <ScoreCard
          label="Avg Close Rate"
          value={`${avgClose}%`}
          valueColor="var(--am-green)"
          delta={7}
          deltaLabel="pts since week 1"
        />
        <ScoreCard
          label="Avg Score"
          value={avgScore}
          valueColor="var(--am-accent2)"
          delta={11}
          deltaLabel="pts since week 1"
        />
        <ScoreCard
          label="Total Calls"
          value={totalCalls}
          deltaLabel={`${trainers.length} active trainers`}
        />
        <ScoreCard
          label="Best Close Rate"
          value={`${topTrainer.closeRate}%`}
          delta={topTrainer.closeDelta}
          deltaLabel={topTrainer.name}
        />
      </div>

      {/* ── Main grid: ranking + alerts ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 mb-4">

        {/* Trainer ranking */}
        <div
          className="rounded-2xl p-5 border shadow-md"
          style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
        >
          <p className="text-[13px] font-medium mb-4" style={{ color: 'var(--am-text)' }}>
            Trainer Ranking
          </p>
          {sorted.map((trainer, i) => (
            <div
              key={trainer.id}
              className="flex items-center gap-3 py-2.5"
              style={{
                borderBottom: i < sorted.length - 1 ? '1px solid var(--am-border)' : 'none',
              }}
            >
              <div
                className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-xs font-semibold font-mono flex-shrink-0"
                style={{
                  background: avatarBgMap[trainer.avatarColor],
                  color: avatarTextMap[trainer.avatarColor],
                }}
              >
                {trainer.avatar}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate" style={{ color: 'var(--am-text)' }}>
                  {trainer.name}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--am-muted)' }}>
                  {trainer.lastActive} · {trainer.totalCalls} calls
                </p>
              </div>

              <div className="flex items-center gap-2 md:gap-3.5 flex-shrink-0">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-semibold font-mono" style={{ color: 'var(--am-text)' }}>
                    {trainer.closeRate}%
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--am-muted)' }}>close</div>
                </div>
                <div className="text-right hidden sm:block">
                  <div
                    className="text-sm font-semibold font-mono"
                    style={{ color: trainer.closeDelta >= 0 ? 'var(--am-green)' : 'var(--am-red)' }}
                  >
                    {trainer.closeDelta > 0 ? `+${trainer.closeDelta}` : trainer.closeDelta}
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--am-muted)' }}>delta</div>
                </div>
                <ScorePill score={trainer.score} />
              </div>
            </div>
          ))}
        </div>

        {/* Active alerts */}
        <div
          className="rounded-2xl p-5 border shadow-md"
          style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
        >
          <p className="text-[13px] font-medium mb-4" style={{ color: 'var(--am-text)' }}>
            Active Alerts
          </p>
          {alerts.map((alert) => (
            <AlertItem key={alert.text} {...alert} />
          ))}
        </div>
      </div>

      {/* ── Charts: rubric + trend ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

        {/* Rubric bars */}
        <div
          className="rounded-2xl p-5 border shadow-md"
          style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
        >
          <p className="text-[13px] font-medium mb-4" style={{ color: 'var(--am-text)' }}>
            Rubric by Section — Team Average
          </p>
          <div className="flex flex-col gap-2.5">
            {rubric.map((section) => (
              <RubricBar
                key={section.id}
                label={section.name}
                value={section.teamAvg}
                color={section.color}
              />
            ))}
          </div>
        </div>

        {/* Trend chart */}
        <div
          className="rounded-2xl p-5 border shadow-md"
          style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
        >
          <p className="text-[13px] font-medium mb-3" style={{ color: 'var(--am-text)' }}>
            6-Week Trend
          </p>
          <TrendChart data={trend} />
        </div>
      </div>

      {/* ── Detailed rubric table ──────────────────────────────── */}
      <SectionLabel>Score by Trainer — Detailed Rubric</SectionLabel>
      <div
        className="rounded-2xl p-5 border mb-4 overflow-x-auto"
        style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th
                className="text-[11px] font-medium text-left pb-2.5 pr-2"
                style={{ color: 'var(--am-muted)', borderBottom: '1px solid var(--am-border)' }}
              >
                Section
              </th>
              {['Team', 'Marcus R.', 'Jamie L.', 'Jordan K.', 'Taylor M.'].map((h) => (
                <th
                  key={h}
                  className="text-[11px] font-medium text-right pb-2.5 px-2"
                  style={{ color: 'var(--am-muted)', borderBottom: '1px solid var(--am-border)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rubric.map((section) => {
              const scores = [
                section.trainerScores.marcus,
                section.trainerScores.jamie,
                section.trainerScores.jordan,
                section.trainerScores.taylor,
              ]
              const maxScore = Math.max(...scores)

              return (
                <tr key={section.id}>
                  <td
                    className="text-xs py-2.5 pr-2"
                    style={{ color: 'var(--am-muted)', borderBottom: '1px solid var(--am-border)' }}
                  >
                    {section.name}
                  </td>
                  <td
                    className="text-xs text-right font-mono px-2 py-2.5"
                    style={{
                      color: section.teamAvg < 65 ? 'var(--am-red)' : 'var(--am-text)',
                      borderBottom: '1px solid var(--am-border)',
                    }}
                  >
                    {section.teamAvg}
                  </td>
                  {scores.map((s, idx) => (
                    <td
                      key={idx}
                      className="text-xs text-right font-mono px-2 py-2.5"
                      style={{
                        color:
                          s === maxScore
                            ? 'var(--am-green)'
                            : s < 65
                              ? 'var(--am-red)'
                              : 'var(--am-text)',
                        fontWeight: s === maxScore ? 600 : 400,
                        borderBottom: '1px solid var(--am-border)',
                      }}
                    >
                      {s}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── AI Insights ───────────────────────────────────────── */}
      <SectionLabel>AI Insights</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  )
}
