'use client'

import { useState, useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { Trainer, BestCall, CallsByTrainerMap, PerformanceTrendPoint } from '@/lib/types'
import type { BehavioralDimension, CoachingRec, BehavioralTrendDimension } from '@/lib/mock-data'
import { TrainerAvatar } from '@/components/shared/TrainerAvatar'
import { BehavioralProfile } from '@/components/shared/BehavioralProfile'
import { BehavioralTrends } from '@/components/shared/BehavioralTrends'
import { CoachingRecommendations } from '@/components/shared/CoachingRecommendations'
import { CallCard } from '@/components/shared/CallCard'
import { PerformanceTrend } from '@/components/shared/PerformanceTrend'

const trainerKeyMap: Record<string, string> = {
  '00000000-0000-0000-0000-000000000301': 'marcus',
  '00000000-0000-0000-0000-000000000302': 'jamie',
  '00000000-0000-0000-0000-000000000303': 'jordan',
  '00000000-0000-0000-0000-000000000304': 'taylor',
}

export function TrainerTabs() {
  const t = useTranslations('Coaching')
  const locale = useLocale()
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [behavioral, setBehavioral] = useState<Record<string, BehavioralDimension[]>>({})
  const [behavioralTrends, setBehavioralTrends] = useState<Record<string, BehavioralTrendDimension[]>>({})
  const [recs, setRecs] = useState<Record<string, CoachingRec[]>>({})
  const [perfTrends, setPerfTrends] = useState<Record<string, PerformanceTrendPoint[]>>({})
  const [bestCallsMap, setBestCallsMap] = useState<CallsByTrainerMap>({})
  const [worstCallsMap, setWorstCallsMap] = useState<CallsByTrainerMap>({})
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    fetch('/api/coaching', { headers: { 'x-locale': locale } })
      .then((r) => r.json())
      .then(({ data }) => {
        if (!data) return
        setTrainers(data.trainers)
        setBehavioral(data.trainerBehavioral)
        setBehavioralTrends(data.trainerTrends ?? {})
        setRecs(data.coachingRecs)
        setPerfTrends(data.performanceTrends ?? {})
        setBestCallsMap(data.bestCalls ?? {})
        setWorstCallsMap(data.worstCalls ?? {})
        setActiveId((prev) => prev || data.trainers[0]?.id || '')
      })
  }, [locale])

  if (!activeId || trainers.length === 0) return null

  const trainer = trainers.find((tr) => tr.id === activeId)!
  const trainerKey = trainerKeyMap[trainer.id]

  const submitted = trainer.callsThisWeek ?? 0
  const total = submitted > 0 ? submitted + Math.round(submitted * 0.1) + 2 : 0
  const submissionRate = total > 0 ? Math.round((submitted / total) * 100) : 0

  const callsLabel = trainer.totalCalls === 1
    ? t('callsLabelOne', { count: trainer.totalCalls })
    : t('callsLabelOther', { count: trainer.totalCalls })

  const bestCalls: BestCall[] = (bestCallsMap[trainerKey] ?? []).slice(0, 2)
  const worstCalls: BestCall[] = (worstCallsMap[trainerKey] ?? []).slice(0, 2)

  return (
    <div>
      {/* ── Trainer selector tabs ─────────────────────────────── */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-xl w-fit"
        style={{ background: 'var(--am-bg3)' }}
      >
        {trainers.map((tr) => {
          const isActive = tr.id === activeId
          return (
            <button
              key={tr.id}
              type="button"
              onClick={() => setActiveId(tr.id)}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150"
              style={{
                background: isActive ? 'var(--am-accent)' : 'transparent',
                color: isActive ? '#fff' : 'var(--am-muted)',
              }}
            >
              {tr.name.split(' ')[0]}
            </button>
          )
        })}
      </div>

      {/* ── Trainer hero card ─────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 border shadow-md mb-4"
        style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
      >
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-3 min-w-0">
            <TrainerAvatar initials={trainer.avatar} color={trainer.avatarColor} size="md" />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold" style={{ color: 'var(--am-text)' }}>
                {trainer.name}
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--am-muted)' }}>
                {callsLabel} · {t('lastActive', { when: trainer.lastActive })}
                {trainer.score >= 4.25 && <> · <span style={{ color: 'var(--am-green)' }}>best on team</span></>}
              </p>
            </div>
          </div>

          <div className="hidden md:block w-px self-stretch" style={{ background: 'var(--am-border)' }} />

          <div className="flex flex-col min-w-[100px]">
            <span className="text-3xl font-bold font-mono" style={{ color: 'var(--am-green)' }}>
              {trainer.closeRate}%
            </span>
            <span className="text-[11px] mt-0.5" style={{ color: 'var(--am-muted)' }}>
              {t('conversionRate')}
            </span>
            {trainer.closeDelta !== 0 && (
              <span className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--am-green)' }}>
                {trainer.closeDelta > 0 ? '+' : ''}{trainer.closeDelta}pts {t('sinceWeek1')}
              </span>
            )}
          </div>

          <div className="hidden md:block w-px self-stretch" style={{ background: 'var(--am-border)' }} />

          <div className="flex flex-col min-w-[72px]">
            <span className="text-2xl font-bold font-mono" style={{ color: 'var(--am-text)' }}>
              {trainer.score}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
              {t('avgScore')}
            </span>
            {trainer.scoreDelta !== 0 && (
              <span className="text-[11px] font-mono" style={{ color: 'var(--am-green)' }}>
                {trainer.scoreDelta > 0 ? '+' : ''}{trainer.scoreDelta}pts
              </span>
            )}
          </div>

          <div className="hidden md:block w-px self-stretch" style={{ background: 'var(--am-border)' }} />

          <div className="flex flex-col min-w-[72px]">
            <span className="text-2xl font-bold font-mono" style={{ color: 'var(--am-text)' }}>
              {submitted}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
              {t('totalCallsWeek')}
            </span>
          </div>

          <div className="hidden md:block w-px self-stretch" style={{ background: 'var(--am-border)' }} />

          {total > 0 && (
            <div className="flex flex-col min-w-[72px]">
              <span className="text-2xl font-bold font-mono" style={{ color: 'var(--am-text)' }}>
                {submissionRate}%
              </span>
              <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
                {t('submissionRate')}
              </span>
              <span className="text-[11px] font-mono" style={{ color: 'var(--am-muted)' }}>
                {submitted}/{total} calls
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Conversion Rate Trend (topo, destaque) ─────────────── */}
      {Object.keys(perfTrends).length > 0 && (
        <PerformanceTrend
          trends={perfTrends}
          fixedId={activeId}
          salesPeople={trainers.map((tr) => ({ id: tr.id, name: tr.name }))}
        />
      )}

      {/* ── Profile (esq) + Trends (dir) lado a lado ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <BehavioralProfile dimensions={behavioral[trainerKey] ?? []} trainerName={trainer.name.split(' ')[0]} />
        <BehavioralTrends dimensions={behavioralTrends[trainerKey] ?? []} />
      </div>

      {/* ── Coaching Recs (largura total) ── */}
      <div className="mb-4">
        <CoachingRecommendations recs={recs[trainerKey] ?? []} />
      </div>

      {/* ── Best (esq) + Needs Improvement (dir) ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          className="rounded-2xl p-5 border shadow-md"
          style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
        >
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
              {t('bestCall')}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {bestCalls.map((call) => (
              <CallCard key={call.prospect + call.date} call={call} variant="best" />
            ))}
          </div>
        </div>

        <div
          className="rounded-2xl p-5 border shadow-md"
          style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
        >
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
              {t('worstCall')}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {worstCalls.map((call) => (
              <CallCard key={call.prospect + call.date} call={call} variant="worst" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
