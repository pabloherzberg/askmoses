'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { IntentSignal } from '@/lib/types'
import { deriveIntentBreakdownForCall } from '@/lib/services/intent'
import { computeIntentIndex, intentIndexToDisplay } from '@/lib/utils/intentScore'
import { IntentRadarChart } from '@/components/shared/IntentRadarChart'
import { DateRangePicker } from '@/components/shared/DateRangePicker'

interface Call {
  id?: string
  prospect: string
  date: string
  score: number
  result: string
  intentBreakdown?: Record<string, number>
}

interface IntentDashboardProps {
  signals: IntentSignal[]
}

export function IntentDashboard({ signals }: IntentDashboardProps) {
  const t = useTranslations('Intent')
  const locale = useLocale()
  const [startDate, setStartDate] = useState<Date>(() => {
    const today = new Date()
    return new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  })
  const [endDate, setEndDate] = useState<Date>(new Date())
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))
    fetch(`/api/calls?days=${days}`)
      .then((r) => r.json())
      .then((response) => {
        if (Array.isArray(response?.data)) {
          setCalls(response.data)
        }
      })
      .catch(() => setCalls([]))
      .finally(() => setLoading(false))
  }, [startDate, endDate])

  const callsWithIntent = calls
    .map((c) => {
      // Phase 3: Use intent scores from IA (c.intentBreakdown), fallback to derived scores
      const breakdown = c.intentBreakdown && typeof c.intentBreakdown === 'object'
        ? c.intentBreakdown
        : deriveIntentBreakdownForCall(c.score, signals)
      const score = c.result === 'closed' ? 5 : computeIntentIndex(breakdown, {
        financial: signals.find(s => s.id === 'financial')?.weight || 4,
        urgency: signals.find(s => s.id === 'urgency')?.weight || 3,
        authority: signals.find(s => s.id === 'authority')?.weight || 2,
        engagement: signals.find(s => s.id === 'engagement')?.weight || 1,
      })
      return { ...c, intentScore: score }
    })
    .filter((c) => c.result !== 'closed')
    .sort((a, b) => b.intentScore - a.intentScore)

  const topCalls = callsWithIntent.slice(0, 5)

  return (
    <div className="rounded-2xl p-5 border shadow-md mb-6" style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}>
      <div className="mb-6">
        <div className="mb-4">
          <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
            {t('sectionLabel')}
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--am-muted)' }}>
            {t('subtitle')}
          </p>
        </div>

        {/* Date Range Picker */}
        <div className="mb-6">
          <DateRangePicker
            onDateRangeChange={(start, end) => {
              setStartDate(start)
              setEndDate(end)
            }}
            defaultDays={7}
          />
        </div>
      </div>

      {/* Radar Chart + Calls list side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <div>
          <IntentRadarChart
            calls={calls}
            signals={signals}
            startDate={startDate}
            endDate={endDate}
            variant="compact"
          />
        </div>

        {/* Calls list — Highest Priority Leads */}
        <div className="space-y-2">
          <p className="text-[12px] font-medium" style={{ color: 'var(--am-text)' }}>
            {t('highestIntentLeads', { defaultValue: 'Highest Priority Leads' })}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
            {t('callsList')} — {topCalls.length} of {callsWithIntent.length}
          </p>
          <div className="space-y-2">
          {loading ? (
            <p className="text-[12px]" style={{ color: 'var(--am-muted)' }}>
              {t('loading', { defaultValue: 'Loading...' })}
            </p>
          ) : topCalls.length > 0 ? (
            topCalls.map((call) => (
              <Link
                key={call.id}
                href={call.id ? `/${locale}/calls/${call.id}` : '#'}
                className="flex items-center justify-between p-3 rounded-lg transition-opacity hover:opacity-80"
                style={{ background: 'var(--am-bg3)' }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium" style={{ color: 'var(--am-text)' }}>
                    {call.prospect}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
                    {new Date(call.date).toLocaleDateString(locale)}
                  </p>
                </div>
                <span className="text-lg font-bold font-mono ml-3" style={{ color: 'var(--am-green)' }}>
                  {intentIndexToDisplay(call.intentScore)}
                </span>
              </Link>
            ))
          ) : (
            <p className="text-[12px]" style={{ color: 'var(--am-muted)' }}>
              {t('noCallsFound')}
            </p>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
