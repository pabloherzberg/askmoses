'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

// closeRate = null → semana sem nenhuma call: vira lacuna no gráfico (sem
// barra), em vez de uma barra falsa de 0% que confundiria o usuário.
type WeeklyPoint = { week: string; closeRate: number | null }

interface CloseRateTrendProps {
  /** Team-mode data */
  data: WeeklyPoint[]
  /** Team-mode summary */
  summary: { from: number; to: number; delta: number }
  /** Per-trainer weekly trends, keyed by trainer id */
  trainerTrends?: Record<string, WeeklyPoint[]>
  /** Trainers available in the selector */
  salesPeople?: { id: string; name: string }[]
}

export function CloseRateTrend({
  data,
  summary,
  trainerTrends,
  salesPeople,
}: CloseRateTrendProps) {
  const t = useTranslations('Shared.closeRateTrend')
  const [selected, setSelected] = useState<string>('team')

  const trainersWithData =
    salesPeople && trainerTrends
      ? salesPeople.filter((sp) =>
          (trainerTrends[sp.id] ?? []).some((p) => p.closeRate != null),
        )
      : []
  const hasSelector = trainersWithData.length > 0

  const activeData: WeeklyPoint[] =
    selected === 'team' ? data : (trainerTrends?.[selected] ?? [])

  // Resumo (primeira → última semana) ignora semanas sem calls (closeRate null).
  const knownPoints = activeData.filter(
    (p): p is { week: string; closeRate: number } => p.closeRate != null,
  )
  const activeSummary =
    selected === 'team'
      ? summary
      : {
          from: knownPoints[0]?.closeRate ?? 0,
          to: knownPoints[knownPoints.length - 1]?.closeRate ?? 0,
          delta:
            (knownPoints[knownPoints.length - 1]?.closeRate ?? 0) -
            (knownPoints[0]?.closeRate ?? 0),
        }

  const deltaSign = activeSummary.delta >= 0 ? '+' : ''
  const summaryColor =
    activeSummary.delta >= 0 ? 'var(--am-green)' : 'var(--am-red)'

  return (
    <div
      className="rounded-2xl p-5 border shadow-md mb-4"
      style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
    >
      <p
        className="text-[13px] font-medium mb-1"
        style={{ color: 'var(--am-text)' }}
      >
        {t('title')}
      </p>
      <p
        className="text-[11px] font-mono mb-3"
        style={{ color: summaryColor }}
      >
        {t('summary', {
          from: activeSummary.from,
          to: activeSummary.to,
          delta: `${deltaSign}${activeSummary.delta}`,
        })}
      </p>

      {hasSelector && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setSelected('team')}
            className="text-[11px] font-medium px-3 py-1 rounded-full transition-colors"
            style={{
              background:
                selected === 'team' ? 'var(--am-accent)' : 'var(--am-bg3)',
              color: selected === 'team' ? '#fff' : 'var(--am-muted)',
            }}
          >
            {t('teamPill')}
          </button>
          {trainersWithData.map((sp) => (
            <button
              key={sp.id}
              type="button"
              onClick={() => setSelected(sp.id)}
              className="text-[11px] font-medium px-3 py-1 rounded-full transition-colors"
              style={{
                background:
                  selected === sp.id ? 'var(--am-accent)' : 'var(--am-bg3)',
                color: selected === sp.id ? '#fff' : 'var(--am-muted)',
              }}
            >
              {sp.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={activeData}
            margin={{ top: 12, right: 12, left: 4, bottom: 0 }}
          >
            <XAxis
              dataKey="week"
              tick={{ fill: 'var(--am-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: 'var(--am-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
              width={44}
            />
            <Tooltip
              cursor={{ fill: 'rgba(122,132,154,0.08)' }}
              contentStyle={{
                background: 'var(--am-bg3)',
                border: '1px solid var(--am-border)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--am-text)',
              }}
              labelStyle={{ color: 'var(--am-muted)', fontSize: 11 }}
              formatter={(value) =>
                value == null
                  ? ['—', t('closeRate')]
                  : [`${value}%`, t('closeRate')]
              }
            />
            <Bar
              dataKey="closeRate"
              fill="var(--am-green)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
