import { getTrainers, getTeamStats } from '@/lib/services/trainers.service'
import { getInsights } from '@/lib/services/insights.service'
import { getRubricSections, getTrendData } from '@/lib/services/rubric.service'
import { ScoreCard } from '@/components/shared/ScoreCard'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { TrainerAvatar } from '@/components/shared/TrainerAvatar'
import { ScorePill } from '@/components/shared/ScorePill'
import { RubricBar } from '@/components/shared/RubricBar'
import { AlertItem } from '@/components/shared/AlertItem'
import { InsightCard } from '@/components/shared/InsightCard'
import { TrendChart } from './_components/TrendChart'
import Link from 'next/link'

export default async function OwnerDashboard() {
  const [trainers, stats, insights, rubric, trend] = await Promise.all([
    getTrainers(),
    getTeamStats(),
    getInsights(),
    getRubricSections(),
    getTrendData(),
  ])

  return (
    <div>
      {/* ── Métricas de topo ──────────────────────────────────────────────── */}
      <SectionLabel>Visão geral da equipe</SectionLabel>
      <div className="grid grid-cols-4 md:grid-cols-2 gap-3 mb-6">
        <ScoreCard
          label="Close rate médio"
          value={`${stats.avgCloseRate}%`}
          valueColor="var(--am-green)"
          delta={7}
          deltaLabel="pts desde semana 1"
          style={{ animationDelay: '0.05s' }}
        />
        <ScoreCard
          label="Score médio"
          value={stats.avgScore}
          valueColor="var(--am-accent2)"
          delta={11}
          deltaLabel="pts desde semana 1"
          style={{ animationDelay: '0.1s' }}
        />
        <ScoreCard
          label="Total de calls"
          value={stats.totalCalls}
          deltaLabel={`${stats.activeTrainers} trainers ativos`}
          style={{ animationDelay: '0.15s' }}
        />
        <ScoreCard
          label="Melhor close rate"
          value={`${stats.bestCloseRate}%`}
          deltaLabel={stats.bestTrainerName}
          style={{ animationDelay: '0.2s' }}
        />
      </div>

      {/* ── Grid principal ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_320px] md:grid-cols-1 gap-4 mb-4">
        {/* Ranking */}
        <div
          className="rounded-2xl p-[20px_22px] border"
          style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
        >
          <p className="text-[13px] font-medium mb-[18px]" style={{ color: 'var(--am-text)' }}>
            Ranking de trainers
          </p>
          {trainers.map((t, i) => (
            <div
              key={t.id}
              className="flex items-center gap-3 py-[11px] border-b last:border-b-0 last:pb-0"
              style={{ borderColor: 'var(--am-border)' }}
            >
              <TrainerAvatar initials={t.avatar} color={t.avatarColor} />
              <div className="flex-1">
                <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
                  {t.name}
                </p>
                <p className="text-[11px] mt-px" style={{ color: 'var(--am-muted)' }}>
                  {t.lastActive} · {t.totalCalls} calls
                </p>
              </div>
              <div className="flex items-center gap-3.5">
                <div className="text-right">
                  <p className="text-sm font-semibold font-mono" style={{ color: 'var(--am-text)' }}>
                    {t.closeRate}%
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--am-muted)' }}>close</p>
                </div>
                <div className="text-right">
                  <p
                    className="text-sm font-semibold font-mono"
                    style={{ color: t.closeDelta >= 0 ? 'var(--am-green)' : 'var(--am-red)' }}
                  >
                    {t.closeDelta >= 0 ? '+' : ''}{t.closeDelta}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--am-muted)' }}>delta</p>
                </div>
                <ScorePill score={t.score} />
              </div>
            </div>
          ))}
        </div>

        {/* Alertas */}
        <div
          className="rounded-2xl p-[20px_22px] border"
          style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
        >
          <p className="text-[13px] font-medium mb-[18px]" style={{ color: 'var(--am-text)' }}>
            Alertas ativos
          </p>
          <AlertItem dotColor="red"   text="Score de Taylor caiu 12pts esta semana"     actionLabel="Revisar" />
          <AlertItem dotColor="amber" text="Taylor sem calls há 3 dias"                  actionLabel="Contatar" />
          <AlertItem dotColor="green" text="Marcus atingiu 74% — melhor da equipe"       actionLabel="Celebrar" />
          <AlertItem dotColor="blue"  text="3 trainers pulam objection handling"          actionLabel="Treinar" />
        </div>
      </div>

      {/* ── Gráficos ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-1 gap-4 mb-4">
        {/* Rubric por seção */}
        <div
          className="rounded-2xl p-[20px_22px] border"
          style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
        >
          <p className="text-[13px] font-medium mb-[18px]" style={{ color: 'var(--am-text)' }}>
            Rubric por seção — média da equipe
          </p>
          <div className="space-y-2.5">
            {rubric.map((s) => (
              <RubricBar key={s.id} label={s.name} value={s.teamAvg} color={s.color} />
            ))}
          </div>
        </div>

        {/* Gráfico de tendência */}
        <div
          className="rounded-2xl p-[20px_22px] border"
          style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
        >
          <p className="text-[13px] font-medium mb-3" style={{ color: 'var(--am-text)' }}>
            Tendência — 6 semanas
          </p>
          <TrendChart data={trend} />
        </div>
      </div>

      {/* ── Tabela detalhada de rubric ────────────────────────────────────── */}
      <SectionLabel>Score por trainer — rubric detalhado</SectionLabel>
      <div
        className="rounded-2xl border mb-4 overflow-x-auto"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Seção', 'Equipe', 'Marcus R.', 'Jamie L.', 'Jordan K.', 'Taylor M.'].map((h, i) => (
                <th
                  key={h}
                  className="text-[11px] font-medium px-2 py-2.5 border-b"
                  style={{
                    color: 'var(--am-muted)',
                    borderColor: 'var(--am-border)',
                    textAlign: i === 0 ? 'left' : 'right',
                    paddingLeft: i === 0 ? '22px' : undefined,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rubric.map((s) => {
              const scores = [s.teamAvg, s.trainerScores.marcus, s.trainerScores.jamie, s.trainerScores.jordan, s.trainerScores.taylor]
              const maxScore = Math.max(...scores.slice(1))
              return (
                <tr key={s.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--am-border)' }}>
                  {scores.map((score, i) => (
                    <td
                      key={i}
                      className="text-xs px-2 py-[9px] font-mono"
                      style={{
                        textAlign: i === 0 ? 'left' : 'right',
                        paddingLeft: i === 0 ? '22px' : undefined,
                        fontFamily: i === 0 ? 'var(--font-sans)' : undefined,
                        color:
                          i === 0
                            ? 'var(--am-muted)'
                            : score === maxScore && i > 0
                            ? 'var(--am-green)'
                            : score < 65 && i > 0
                            ? 'var(--am-red)'
                            : 'var(--am-text)',
                      }}
                    >
                      {i === 0 ? s.name : score}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Insights de IA ────────────────────────────────────────────────── */}
      <SectionLabel>Insights de IA</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  )
}
