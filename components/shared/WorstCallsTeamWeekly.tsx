'use client'

import { useState, useEffect } from 'react'
import type { BestCall, CallsByTrainerMap } from '@/lib/types'
import { CallCard } from '@/components/shared/CallCard'

export function WorstCallsTeamWeekly() {
  const [calls, setCalls] = useState<BestCall[]>([])

  useEffect(() => {
    fetch('/api/coaching')
      .then((r) => r.json())
      .then(({ data }) => {
        if (!data) return
        const teamWeekly: BestCall[] = (data.worstCalls as CallsByTrainerMap).teamWeekly ?? []
        setCalls(teamWeekly.slice(0, 2))
      })
  }, [])

  if (calls.length === 0) return null

  return (
    <div
      className="rounded-2xl p-5 border shadow-md mb-4"
      style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
    >
      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
        <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
          Worst Call This Week
        </p>
      </div>
      <p className="text-[11px] mb-4" style={{ color: 'var(--am-muted)' }}>
        2 calls needing attention this week — use for targeted coaching sessions
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {calls.map((call) => (
          <CallCard key={call.trainerInitials + call.prospect} call={call} variant="worst" />
        ))}
      </div>

    </div>
  )
}
