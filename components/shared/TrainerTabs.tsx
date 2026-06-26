'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { scoreLevel, toDisplay5, toDisplay5Delta } from '@/lib/score-display'
import type { Trainer, BestCall, CallsByTrainerMap, PerformanceTrendPoint } from '@/lib/types'
import type { BehavioralDimension, CoachingRec } from '@/lib/mock-data'
import { TrainerAvatar } from '@/components/shared/TrainerAvatar'
import { BehavioralProfile } from '@/components/shared/BehavioralProfile'
import { CoachingRecommendations } from '@/components/shared/CoachingRecommendations'
import { CallCard } from '@/components/shared/CallCard'
import { PerformanceTrend } from '@/components/shared/PerformanceTrend'

// Coaching recs são geradas por IA sob demanda — 'loading'/'error' são estados
// de carregamento; o array é o resultado.
type RecsState = CoachingRec[] | 'loading' | 'error'

export function TrainerTabs() {
  const t = useTranslations('Coaching')
  const locale = useLocale()
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [behavioral, setBehavioral] = useState<Record<string, BehavioralDimension[]>>({})
  const [perfTrends, setPerfTrends] = useState<Record<string, PerformanceTrendPoint[]>>({})
  const [bestCallsMap, setBestCallsMap] = useState<CallsByTrainerMap>({})
  const [worstCallsMap, setWorstCallsMap] = useState<CallsByTrainerMap>({})
  const [recs, setRecs] = useState<Record<string, RecsState>>({})
  const [activeId, setActiveId] = useState<string>('')

  // Dedup das gerações de recs (sobrevive ao double-invoke do Strict Mode).
  const recsRequested = useRef<Set<string>>(new Set())

  // Bundle do Team Command Center — tudo menos as coaching recs (essas são IA,
  // carregadas por trainer sob demanda). callsByTrainer e allCalls vêm no
  // mesmo response para evitar fetches secundários com trainer_id nulo.
  useEffect(() => {
    fetch('/api/coaching', { headers: { 'x-locale': locale } })
      .then((r) => r.json())
      .then(({ data }) => {
        if (!data) return
        setTrainers(data.trainers)
        setBehavioral(data.trainerBehavioral ?? {})
        setPerfTrends(data.performanceTrends ?? {})
        setBestCallsMap(data.bestCalls ?? {})
        setWorstCallsMap(data.worstCalls ?? {})
        setActiveId((prev) => prev || data.trainers[0]?.id || '')
      })
  }, [locale])

  // Gera as coaching recs do trainer ativo via IA na primeira vez que a tab
  // dele é aberta. O dedup via ref evita refetch e o double-fetch do Strict
  // Mode; sem cancelamento (o resultado é sempre cacheado, mesmo após troca
  // de tab) — era o cancelamento que travava o estado em 'loading'.
  useEffect(() => {
    if (!activeId) return
    const trainer = trainers.find((tr) => tr.id === activeId)
    if (!trainer || (trainer.totalCalls ?? 0) === 0) return

    const reqKey = `${locale}:${activeId}`
    if (recsRequested.current.has(reqKey)) return
    recsRequested.current.add(reqKey)

    setRecs((p) => ({ ...p, [activeId]: 'loading' }))
    fetch(`/api/coaching/recommendations?trainerId=${activeId}`, { headers: { 'x-locale': locale } })
      .then((r) => r.json())
      .then((json) => {
        const next: RecsState = Array.isArray(json?.data?.recs) ? json.data.recs : 'error'
        setRecs((p) => ({ ...p, [activeId]: next }))
      })
      .catch(() => setRecs((p) => ({ ...p, [activeId]: 'error' })))
  }, [activeId, trainers, locale])

  if (!activeId || trainers.length === 0) return null

  const trainer = trainers.find((tr) => tr.id === activeId)!
  const trainerKey = trainer.id
  const firstName = trainer.name.split(' ')[0]
  const hasData = (trainer.totalCalls ?? 0) > 0


  const callsLabel = trainer.totalCalls === 1
    ? t('callsLabelOne', { count: trainer.totalCalls })
    : t('callsLabelOther', { count: trainer.totalCalls ?? 0 })

  // Prefere o ISO de `lastActiveAt` (real, vem da call mais recente) e
  // formata no locale ativo. Fallback pro `lastActive` cacheado (EN) só
  // pra trainers sem call recente, onde a UI já mostra um placeholder.
  const lastActiveDisplay = (() => {
    if (trainer.lastActiveAt) {
      const d = new Date(trainer.lastActiveAt)
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
      }
    }
    return trainer.lastActive
  })()

  const callsThisWeek = trainer.callsThisWeek ?? 0
  const bestCalls: BestCall[] = (bestCallsMap[trainerKey] ?? []).slice(0, 2)
  const worstCalls: BestCall[] = (worstCallsMap[trainerKey] ?? []).slice(0, 2)
  const trainerRecs = recs[trainerKey]

  const cardStyle = { background: 'var(--card)', borderColor: 'var(--am-border)' }

  return (
    <div>
      {/* ── Trainer selector tabs ─────────────────────────────── */}
      <div
        className="flex flex-wrap gap-1 mb-6 p-1 rounded-xl w-fit"
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
      <div className="rounded-2xl p-5 border shadow-md mb-4" style={cardStyle}>
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-3 min-w-0">
            <TrainerAvatar initials={trainer.avatar} color={trainer.avatarColor} size="md" />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold" style={{ color: 'var(--am-text)' }}>
                {trainer.name}
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--am-muted)' }}>
                {callsLabel} · {t('lastActive', { when: lastActiveDisplay })}
                {scoreLevel(trainer.score) === 'high' && <> · <span style={{ color: 'var(--am-green)' }}>best on team</span></>}
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
              {toDisplay5(trainer.score)}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
              {t('avgScore')}
            </span>
            {trainer.scoreDelta !== 0 && (
              <span className="text-[11px] font-mono" style={{ color: 'var(--am-green)' }}>
                {toDisplay5Delta(trainer.scoreDelta)}
              </span>
            )}
          </div>

          <div className="hidden md:block w-px self-stretch" style={{ background: 'var(--am-border)' }} />

          <div className="flex flex-col min-w-[72px]">
            <span className="text-2xl font-bold font-mono" style={{ color: 'var(--am-text)' }}>
              {callsThisWeek}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
              {t('totalCallsWeek')}
            </span>
          </div>
        </div>
      </div>

      {!hasData ? (
        /* ── Sem calls reais → não fabrica conteúdo (recs/best/worst só
             fazem sentido pra quem tem o que analisar). ─────────── */
        <div className="rounded-2xl p-8 border shadow-md text-center" style={cardStyle}>
          <p className="text-[13px]" style={{ color: 'var(--am-muted)' }}>
            {t('noCallsYet', { name: firstName })}
          </p>
        </div>
      ) : (
        <>
          {/* ── Conversion Rate Trend ───────────────────────────── */}
          {(perfTrends[activeId]?.length ?? 0) > 0 && (
            <PerformanceTrend
              trends={perfTrends}
              fixedId={activeId}
              salesPeople={trainers.map((tr) => ({ id: tr.id, name: tr.name }))}
            />
          )}

          {/* ── Behavioral Profile ──────────────────────────────── */}
          <div className="mb-4">
            <BehavioralProfile dimensions={behavioral[trainerKey] ?? []} trainerName={firstName} />
          </div>

          {/* ── Coaching Recommendations (IA, lazy + mock se IA falhar) ── */}
          <div className="mb-4">
            {Array.isArray(trainerRecs) ? (
              /* key={activeId} remonta ao trocar de trainer — zera o estado
                 "enviado" das recomendações entre tabs. */
              <CoachingRecommendations
                key={activeId}
                recs={trainerRecs}
                trainerId={trainer.id}
                trainerName={trainer.name}
              />
            ) : (
              <div className="rounded-2xl p-5 border shadow-md" style={cardStyle}>
                <p className="text-[12px]" style={{ color: 'var(--am-muted)' }}>
                  {trainerRecs === 'error' ? t('recsGenerateError') : t('recsLoading')}
                </p>
              </div>
            )}
          </div>


          {/* ── Best + Needs Improvement ────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl p-5 border shadow-md" style={cardStyle}>
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
                  {t('bestCall')}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {bestCalls.length > 0 ? (
                  bestCalls.map((call) => (
                    <CallCard key={call.prospect + call.date} call={call} variant="best" />
                  ))
                ) : (
                  <p className="text-[12px]" style={{ color: 'var(--am-muted)' }}>
                    {t('noCallsYet', { name: firstName })}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl p-5 border shadow-md" style={cardStyle}>
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
                  {t('worstCall')}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {worstCalls.length > 0 ? (
                  worstCalls.map((call) => (
                    <CallCard key={call.prospect + call.date} call={call} variant="worst" />
                  ))
                ) : (
                  <p className="text-[12px]" style={{ color: 'var(--am-muted)' }}>
                    {t('worstCallEmpty')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
