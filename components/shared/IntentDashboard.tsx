'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { Call, IntentSignal } from '@/lib/types'
import { deriveIntentBreakdownForCall } from '@/lib/services/intent'
import { computeIntentIndex, intentIndexToDisplay, resolveIntentWeights } from '@/lib/utils/intentScore'
import { TeamIntentRadarChart } from '@/components/shared/TeamIntentRadarChart'
import { IntentRadarChart } from '@/components/shared/IntentRadarChart'
import { PeriodTabs } from '@/components/shared/billing/PeriodTabs'
import type { BillingPeriodRange } from '@/lib/types'

const PERIOD_DAYS: Record<BillingPeriodRange, number> = { '1w': 7, '2w': 14, '3w': 21, '1m': 30 }

interface IntentDashboardProps {
  signals: IntentSignal[]
}

export function IntentDashboard({ signals }: IntentDashboardProps) {
  const t = useTranslations('Intent')
  const locale = useLocale()
  const [view, setView] = useState<'team' | 'seller'>('team')
  const [period, setPeriod] = useState<BillingPeriodRange>('1w')
  const [calls, setCalls] = useState<Call[]>([])
  const [trainers, setTrainers] = useState<{ id: string; name: string }[]>([])
  const [activeTrainerId, setActiveTrainerId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000)

  useEffect(() => {
    setLoading(true)
    fetch('/api/calls?limit=200')
      .then((r) => r.json())
      .then((response) => {
        if (Array.isArray(response?.data)) {
          const data: Call[] = response.data
          setCalls(data)
          // Extract unique trainers from calls.
          // Calls GHL têm trainer_id null — usa trainerName como chave de fallback.
          const seen = new Map<string, string>()
          for (const c of data) {
            const key = c.trainerId ?? c.trainerName
            if (key && !seen.has(key)) {
              seen.set(key, c.trainerName ?? key)
            }
          }
          const trainerList = Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
          setTrainers(trainerList)
          setActiveTrainerId((prev) => prev || trainerList[0]?.id || '')
        }
      })
      .catch(() => setCalls([]))
      .finally(() => setLoading(false))
  }, [])

  const weights = resolveIntentWeights(signals)

  // Filtra calls pelo período selecionado (client-side) — usado só pelo radar.
  // Se não houver calls no período, usa todas as disponíveis (ex: dados de demo históricos).
  const periodFiltered = calls.filter((c) => new Date(c.date).getTime() >= startDate.getTime())
  const periodCalls = periodFiltered.length > 0 ? periodFiltered : calls

  // Calls do dia atual — usadas exclusivamente pela lista de leads prioritários.
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const leadsPool = calls.filter((c) => new Date(c.date).getTime() >= todayStart.getTime())

  function intentScore(c: Call): number {
    if (c.result === 'closed') return 5
    const bd = c.intentBreakdown && typeof c.intentBreakdown === 'object'
      ? c.intentBreakdown
      : deriveIntentBreakdownForCall(c.score, signals)
    return computeIntentIndex(bd, weights)
  }

  // Team view: leads do dia com intent > 3.5, ordenados por intent desc
  const teamLeads = leadsPool
    .map((c) => ({ ...c, intentScore: intentScore(c) }))
    .filter((c) => c.intentScore > 3.5)
    .sort((a, b) => b.intentScore - a.intentScore)
    .slice(0, 5)

  // Seller view — compara por trainerId quando disponível, senão por trainerName
  const callKey = (c: Call) => c.trainerId ?? c.trainerName ?? ''
  const activeTrainer = trainers.find((t) => t.id === activeTrainerId)
  const trainerCalls = periodCalls.filter((c) => callKey(c) === activeTrainerId)
  const otherCalls = periodCalls.filter((c) => callKey(c) !== activeTrainerId)
  const trainerLeadsPool = leadsPool.filter((c) => callKey(c) === activeTrainerId)

  const sellerLeads = trainerLeadsPool
    .map((c) => ({ ...c, intentScore: intentScore(c) }))
    .filter((c) => c.intentScore > 3.5)
    .sort((a, b) => b.intentScore - a.intentScore)
    .slice(0, 5)

  return (
    <div className="rounded-2xl border shadow-md" style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 p-5 pb-4 flex-wrap">
        <div>
          <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
            {t('sectionLabel')}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--am-muted)' }}>
            {t('subtitle')}
          </p>
        </div>

        {/* Team / By Seller toggle */}
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--am-bg3)' }}>
          {(['team', 'seller'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className="px-3 py-1 rounded-md text-[12px] font-medium transition-all"
              style={{
                background: view === v ? 'var(--am-accent)' : 'transparent',
                color: view === v ? '#fff' : 'var(--am-muted)',
              }}
            >
              {v === 'team' ? 'Team' : 'By Seller'}
            </button>
          ))}
        </div>
      </div>

      {/* Period selector */}
      <div className="px-5 pb-4">
        <PeriodTabs value={period} onChange={setPeriod} />
      </div>

      {loading ? (
        <div className="px-5 pb-5">
          <p className="text-[12px]" style={{ color: 'var(--am-muted)' }}>
            {t('loading', { defaultValue: 'Loading...' })}
          </p>
        </div>
      ) : view === 'team' ? (
        /* ── Team view ──────────────────────────────────────────── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-5 pb-5">
          <IntentRadarChart
            calls={periodCalls}
            signals={signals}
            startDate={startDate}
            endDate={endDate}
            variant="compact"
          />
          <LeadsList
            leads={teamLeads}
            locale={locale}
            emptyLabel="No leads with intent above 3.5 today"
            title={t('highestIntentLeads', { defaultValue: 'Highest Priority Leads' })}
            subtitle={`Today · ${teamLeads.length} leads with intent > 3.5`}
          />
        </div>
      ) : (
        /* ── By Seller view ─────────────────────────────────────── */
        <div className="px-5 pb-5">
          {/* Trainer selector */}
          {trainers.length > 0 && (
            <div
              className="flex flex-wrap gap-1 mb-5 p-1 rounded-xl w-fit"
              style={{ background: 'var(--am-bg3)' }}
            >
              {trainers.map((tr) => (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() => setActiveTrainerId(tr.id)}
                  className="px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150"
                  style={{
                    background: tr.id === activeTrainerId ? 'var(--am-accent)' : 'transparent',
                    color: tr.id === activeTrainerId ? '#fff' : 'var(--am-muted)',
                  }}
                >
                  {tr.name.split(' ')[0]}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TeamIntentRadarChart
              trainerCalls={trainerCalls}
              teamCalls={otherCalls}
              signals={signals}
              trainerName={activeTrainer?.name ?? ''}
              startDate={startDate}
              endDate={endDate}
            />
            <LeadsList
              leads={sellerLeads}
              locale={locale}
              emptyLabel={t('noCallsFound')}
              title={t('highestIntentLeads', { defaultValue: 'Highest Priority Leads' })}
              subtitle={activeTrainer ? `Today · ${activeTrainer.name.split(' ')[0]} · ${sellerLeads.length} leads with intent > 3.5` : 'Today'}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function LeadsList({
  leads,
  locale,
  emptyLabel,
  title,
  subtitle,
}: {
  leads: (Call & { intentScore: number })[]
  locale: string
  emptyLabel: string
  title: string
  subtitle: string
}) {
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-medium" style={{ color: 'var(--am-text)' }}>
        {title}
      </p>
      {subtitle && (
        <p className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
          {subtitle}
        </p>
      )}
      <div className="space-y-2 pt-1">
        {leads.length > 0 ? (
          leads.map((call) => (
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
                  {call.trainerName && (
                    <span className="font-medium">
                      {call.trainerName} ·{' '}
                    </span>
                  )}
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
            {emptyLabel}
          </p>
        )}
      </div>
    </div>
  )
}
