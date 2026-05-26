'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { KpiCard } from '@/components/shared/KpiCard'
import { toDisplay5 } from '@/lib/score-display'

export interface WeeklyBucket {
  /** Score 0–100 médio das calls da semana. 0 se a semana foi vazia. */
  score: number
  /** Close rate 0–100 das calls da semana. 0 se vazia. */
  closeRate: number
  /** Volume de calls na semana. */
  calls: number
  /** Volume de wins (closed) na semana. */
  wins: number
  /** Marca semana sem dados — diferencia "0% real" de "sem amostras". */
  empty: boolean
}

interface TrainerKpiStripProps {
  /**
   * Buckets semanais em ordem cronológica (mais antigo → mais recente).
   * Deve ter pelo menos (maxWindow + 1) entradas pra suportar o delta da maior janela.
   * Quando há menos histórico, o bucket vai com empty=true.
   */
  buckets: WeeklyBucket[]
  /** Totais históricos (todas as calls do trainer, sem janela). */
  totals: {
    calls: number
    wins: number
    /** Score médio histórico, 0–100. */
    avgScore: number
    /** Close rate histórico, 0–100. */
    closeRate: number
  }
}

type WindowSize = 2 | 4 | 6
const WINDOW_OPTIONS: WindowSize[] = [2, 4, 6]
const DEFAULT_WINDOW: WindowSize = 6

interface WindowAggregate {
  score: number
  closeRate: number
  calls: number
  wins: number
  /** Comparativo da semana anterior à janela. undefined se não há histórico. */
  prev?: { score: number; closeRate: number; calls: number; wins: number }
  sparkScore: number[]
  sparkClose: number[]
  sparkCalls: number[]
  sparkWins: number[]
}

function aggregate(buckets: WeeklyBucket[], window: WindowSize): WindowAggregate {
  // Últimos `window` buckets. O bucket imediatamente anterior (se existir) vira `prev`.
  const total = buckets.length
  const sliceStart = Math.max(0, total - window)
  const slice = buckets.slice(sliceStart)
  const priorIdx = sliceStart - 1
  const priorBucket = priorIdx >= 0 ? buckets[priorIdx] : undefined

  const nonEmpty = slice.filter((b) => !b.empty)
  const callsSum = slice.reduce((s, b) => s + b.calls, 0)
  const winsSum = slice.reduce((s, b) => s + b.wins, 0)
  const scoreAvg = nonEmpty.length > 0
    ? Math.round(nonEmpty.reduce((s, b) => s + b.score, 0) / nonEmpty.length)
    : 0
  const closeAvg = callsSum > 0 ? Math.round((winsSum / callsSum) * 100) : 0

  return {
    score: scoreAvg,
    closeRate: closeAvg,
    calls: callsSum,
    wins: winsSum,
    prev: priorBucket && !priorBucket.empty
      ? {
          score: priorBucket.score,
          closeRate: priorBucket.closeRate,
          calls: priorBucket.calls,
          wins: priorBucket.wins,
        }
      : undefined,
    sparkScore: slice.map((b) => b.score),
    sparkClose: slice.map((b) => b.closeRate),
    sparkCalls: slice.map((b) => b.calls),
    sparkWins: slice.map((b) => b.wins),
  }
}

export function TrainerKpiStrip({ buckets, totals }: TrainerKpiStripProps) {
  const t = useTranslations('Trainer')
  const [window, setWindow] = useState<WindowSize>(DEFAULT_WINDOW)

  const agg = useMemo(() => aggregate(buckets, window), [buckets, window])

  // Deltas: valor da janela atual vs valor da semana imediatamente anterior.
  // Score em escala 0–5 (1 casa); closeRate em pontos percentuais; calls/wins absoluto.
  const scoreDelta = agg.prev
    ? Math.round((agg.score - agg.prev.score) / 2) / 10
    : undefined
  const closeDelta = agg.prev ? agg.closeRate - agg.prev.closeRate : undefined
  const callsDelta = agg.prev ? agg.calls - agg.prev.calls : undefined
  const winsDelta = agg.prev ? agg.wins - agg.prev.wins : undefined

  const deltaLabel = t('kpiDeltaVsPrev')

  return (
    <section className="mb-6">
      {/* Window selector */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-[11px] uppercase tracking-wide font-medium"
          style={{ color: 'var(--am-muted)' }}
        >
          {t('kpiWindow')}
        </span>
        <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--am-bg3)' }}>
          {WINDOW_OPTIONS.map((w) => {
            const active = window === w
            return (
              <button
                key={w}
                type="button"
                onClick={() => setWindow(w)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
                style={{
                  background: active ? 'var(--am-bg2)' : 'transparent',
                  color: active ? 'var(--am-text)' : 'var(--am-muted)',
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                }}
              >
                {t('kpiWindowWeeks', { n: w })}
              </button>
            )
          })}
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label={t('myScore')}
          value={toDisplay5(agg.score)}
          valueColor="var(--am-accent2)"
          sublabel={t('kpiAvgSuffix', { value: toDisplay5(totals.avgScore) })}
          delta={scoreDelta}
          deltaLabel={deltaLabel}
          sparkData={agg.sparkScore}
          sparkColor="var(--am-accent2)"
          sparkDomain={[0, 100]}
        />
        <KpiCard
          label={t('closeRate')}
          value={`${agg.closeRate}%`}
          valueColor="var(--am-green)"
          sublabel={t('kpiAvgSuffix', { value: `${totals.closeRate}%` })}
          delta={closeDelta}
          deltaSuffix="pp"
          deltaLabel={deltaLabel}
          sparkData={agg.sparkClose}
          sparkColor="var(--am-green)"
          sparkDomain={[0, 100]}
        />
        <KpiCard
          label={t('callsKpi')}
          value={agg.calls}
          sublabel={t('kpiTotalSuffix', { count: totals.calls })}
          delta={callsDelta}
          deltaLabel={deltaLabel}
          sparkData={agg.sparkCalls}
          sparkColor="var(--am-blue)"
        />
        <KpiCard
          label={t('winsKpi')}
          value={agg.wins}
          valueColor="var(--am-green)"
          sublabel={t('kpiTotalSuffix', { count: totals.wins })}
          delta={winsDelta}
          deltaLabel={deltaLabel}
          sparkData={agg.sparkWins}
          sparkColor="var(--am-green)"
        />
      </div>
    </section>
  )
}
