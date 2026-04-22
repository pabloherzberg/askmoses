'use client'

import { useState, useEffect } from 'react'
import type { Trainer, CallsByTrainerMap } from '@/lib/types'
import type { BehavioralDimension, CoachingRec } from '@/lib/mock-data'
import { TrainerAvatar } from '@/components/shared/TrainerAvatar'
import { BehavioralProfile } from '@/components/shared/BehavioralProfile'
import { CoachingRecommendations } from '@/components/shared/CoachingRecommendations'
import { CallCard } from '@/components/shared/CallCard'
import { ScoreCard } from '@/components/shared/ScoreCard'

const trainerKeyMap: Record<string, string> = {
  '00000000-0000-0000-0000-000000000301': 'marcus',
  '00000000-0000-0000-0000-000000000302': 'jamie',
  '00000000-0000-0000-0000-000000000303': 'jordan',
  '00000000-0000-0000-0000-000000000304': 'taylor',
}

export function TrainerTabs() {
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [bestCalls, setBestCalls] = useState<CallsByTrainerMap>({})
  const [worstCalls, setWorstCalls] = useState<CallsByTrainerMap>({})
  const [behavioral, setBehavioral] = useState<Record<string, BehavioralDimension[]>>({})
  const [recs, setRecs] = useState<Record<string, CoachingRec[]>>({})
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    fetch('/api/coaching')
      .then((r) => r.json())
      .then(({ data }) => {
        if (!data) return
        setTrainers(data.trainers)
        setBestCalls(data.bestCalls)
        setWorstCalls(data.worstCalls)
        setBehavioral(data.trainerBehavioral)
        setRecs(data.coachingRecs)
        setActiveId(data.trainers[0]?.id ?? '')
      })
  }, [])

  if (!activeId || trainers.length === 0) return null

  const trainer = trainers.find((t) => t.id === activeId)!
  const trainerKey = trainerKeyMap[trainer.id]
  const calls = bestCalls[trainerKey] ?? []
  const worst = worstCalls[trainerKey] ?? []

  return (
    <div>
      {/* Tabs */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-xl w-fit"
        style={{ background: 'var(--am-bg3)' }}
      >
        {trainers.map((t) => {
          const isActive = t.id === activeId
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveId(t.id)}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150"
              style={{
                background: isActive ? 'var(--am-accent)' : 'transparent',
                color: isActive ? '#fff' : 'var(--am-muted)',
              }}
            >
              {t.name.split(' ')[0]}
            </button>
          )
        })}
      </div>

      {/* Trainer header */}
      <div className="flex items-center gap-3 mb-4">
        <TrainerAvatar initials={trainer.avatar} color={trainer.avatarColor} size="md" />
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
        <BehavioralProfile dimensions={behavioral[trainerKey] ?? []} />
      </div>

      {/* AI Coaching Recommendations */}
      <div className="mb-4">
        <CoachingRecommendations recs={recs[trainerKey] ?? []} />
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
            <CallCard key={call.prospect + call.date} call={call} variant="best" />
          ))}
        </div>
        <p className="mt-4 text-[10px]" style={{ color: 'var(--am-amber)' }}>
          † all values sourced from mock-data.ts — Listen at X:XX → is non-functional in demo
        </p>
      </div>

      {/* Worst Call This Week */}
      <div
        className="rounded-2xl p-5 border shadow-md mt-4"
        style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
      >
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
            Worst Call This Week
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
          {worst.map((call) => (
            <CallCard key={call.prospect + call.date} call={call} variant="worst" />
          ))}
        </div>
        <p className="mt-4 text-[10px]" style={{ color: 'var(--am-amber)' }}>
          † all values sourced from mock-data.ts — Review at X:XX → is non-functional in demo
        </p>
      </div>
    </div>
  )
}
