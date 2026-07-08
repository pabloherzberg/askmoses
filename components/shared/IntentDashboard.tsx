'use client'

import { useState, useEffect } from 'react'

import { useLocale, useTranslations } from 'next-intl'
import type { Call, IntentSignal } from '@/lib/types'
import { deriveIntentBreakdownForCall } from '@/lib/services/intent'
import { computeIntentIndex, intentIndexToDisplay, resolveIntentWeights } from '@/lib/utils/intentScore'
import { TeamIntentRadarChart } from '@/components/shared/TeamIntentRadarChart'
import { IntentRadarChart } from '@/components/shared/IntentRadarChart'
import { PeriodTabs } from '@/components/shared/billing/PeriodTabs'
import { IntentPeriodTabs } from '@/components/shared/IntentPeriodTabs'
import type { BillingPeriodRange, IntentDateRange } from '@/lib/types'

const PERIOD_DAYS: Record<BillingPeriodRange, number> = { '1w': 7, '2w': 14, '3w': 21, '1m': 30 }
const LEADS_RANGE_DAYS: Record<IntentDateRange, number> = { '1w': 7, '2w': 14, '15d': 15, '1m': 30 }

interface IntentDashboardProps {
  signals: IntentSignal[]
}

export function IntentDashboard({ signals }: IntentDashboardProps) {
  const t = useTranslations('Intent')
  const locale = useLocale()
  const [view, setView] = useState<'team' | 'seller' | 'lead'>('team')
  const [period, setPeriod] = useState<BillingPeriodRange>('1w')
  const [calls, setCalls] = useState<Call[]>([])
  const [trainers, setTrainers] = useState<{ id: string; name: string }[]>([])
  const [activeTrainerId, setActiveTrainerId] = useState<string>('')
  const [activeLeadKey, setActiveLeadKey] = useState<string>('')
  const [loading, setLoading] = useState(false)
  // Filtro de período para a lista de leads — default D-1 (não inclui hoje,
  // que normalmente ainda está incompleto/acumulando calls).
  const [leadsRange, setLeadsRange] = useState<IntentDateRange>('1w')
  // Paginação da lista de leads — 10 por página. Reseta sempre que o
  // conjunto de leads muda (range, view ou trainer), senão o usuário pode
  // ficar numa página que não existe mais para o novo filtro.
  const [leadsPage, setLeadsPage] = useState(1)

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

  // Reseta a página sempre que o conjunto de leads exibido muda — evita
  // ficar numa página vazia depois de trocar range/view/trainer/lead.
  useEffect(() => {
    setLeadsPage(1)
  }, [leadsRange, view, activeTrainerId, activeLeadKey])

  const weights = resolveIntentWeights(signals)

  // Filtra calls pelo período selecionado (client-side) — usado só pelo radar.
  // Se não houver calls no período, usa todas as disponíveis (ex: dados de demo históricos).
  const periodFiltered = calls.filter((c) => new Date(c.date).getTime() >= startDate.getTime())
  const periodCalls = periodFiltered.length > 0 ? periodFiltered : calls

  // Janela da lista de leads prioritários — default D-1 (ontem) até
  // D-1-N dias atrás, conforme o range escolhido. Não inclui hoje: o
  // acúmulo de leads do dia corrente ainda está em andamento.
  //
  // Ancorada na call mais recente (não em `new Date()`): em orgs de demo os
  // dados são históricos (ex.: 2026-06) e `new Date()` real (ex.: 2026-06-30)
  // faria QUALQUER range cair fora da janela, deixando o filtro sem efeito
  // (todas as opções resultavam no mesmo fallback "usa tudo"). Em produção,
  // a call mais recente é ~hoje, então o comportamento equivale a D-1 real.
  const mostRecentCallTime = calls.length > 0
    ? Math.max(...calls.map((c) => new Date(c.date).getTime()))
    : endDate.getTime()
  const anchorDate = new Date(mostRecentCallTime)
  const leadsWindowEnd = new Date(Date.UTC(
    anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), anchorDate.getUTCDate() - 1,
    23, 59, 59, 999,
  ))
  const leadsWindowStart = new Date(
    leadsWindowEnd.getTime() - (LEADS_RANGE_DAYS[leadsRange] - 1) * 24 * 60 * 60 * 1000,
  )
  const leadsWindowStartOfDay = new Date(Date.UTC(
    leadsWindowStart.getUTCFullYear(), leadsWindowStart.getUTCMonth(), leadsWindowStart.getUTCDate(),
    0, 0, 0, 0,
  ))
  const leadsPool = calls.filter((c) => {
    const t = new Date(c.date).getTime()
    return t >= leadsWindowStartOfDay.getTime() && t <= leadsWindowEnd.getTime()
  })

  function intentScore(c: Call): number {
    const bd = c.intentBreakdown && typeof c.intentBreakdown === 'object'
      ? c.intentBreakdown
      : deriveIntentBreakdownForCall(c.score, signals)
    return computeIntentIndex(bd, weights)
  }

  // Agrupa por lead (contactId quando disponível, senão prospect/nome do cliente).
  // Para cada lead mantém apenas a call com maior intent — sem duplicatas.
  function dedupeByLead(pool: Call[]) {
    const byLead = new Map<string, Call & { intentScore: number }>()
    for (const c of pool) {
      // Só exibe leads com breakdown de intent real — sem isso a tabela mostra
      // "—" nas 4 colunas (Financial/Urgency/Authority/Engagement) porque o
      // fallback sintético (5,5,5,5) usado só pra calcular o score não é
      // persistido em call.intentBreakdown.
      if (!c.intentBreakdown || typeof c.intentBreakdown !== 'object') continue
      const score = intentScore(c)
      if (score <= 3.5) continue
      const key = c.contactId ?? c.prospect ?? c.id
      const existing = byLead.get(key)
      if (!existing || score > existing.intentScore) {
        byLead.set(key, { ...c, intentScore: score })
      }
    }
    return Array.from(byLead.values())
      .sort((a, b) => b.intentScore - a.intentScore)
  }

  // Team view: leads do dia com intent > 3.5, um por cliente, ordenados por intent desc
  const teamLeads = dedupeByLead(leadsPool)

  // Seller view — compara por trainerId quando disponível, senão por trainerName
  const callKey = (c: Call) => c.trainerId ?? c.trainerName ?? ''
  const activeTrainer = trainers.find((t) => t.id === activeTrainerId)
  const trainerCalls = periodCalls.filter((c) => callKey(c) === activeTrainerId)
  const otherCalls = periodCalls.filter((c) => callKey(c) !== activeTrainerId)
  const trainerLeadsPool = leadsPool.filter((c) => callKey(c) === activeTrainerId)
  const sellerLeads = dedupeByLead(trainerLeadsPool)

  // Lead view — lista de leads únicos (todos do leadsPool, sem filtro de intent mínimo)
  // para popular o seletor. Chave = contactId ?? prospect.
  const leadOptions: { key: string; name: string }[] = Array.from(
    teamLeads.reduce((map, c) => {
      const key = c.contactId ?? c.prospect ?? c.id
      if (!map.has(key)) map.set(key, c.prospect || c.lead_name || key)
      return map
    }, new Map<string, string>()).entries()
  ).map(([key, name]) => ({ key, name }))

  const resolvedLeadKey = activeLeadKey || leadOptions[0]?.key || ''
  const leadCallsPool = leadsPool.filter((c) => {
    const key = c.contactId ?? c.prospect ?? c.id
    return key === resolvedLeadKey
  })
  const leadCalls = dedupeByLead(leadCallsPool)
  // Para o radar na view lead: todas as calls do período daquele lead
  const leadPeriodCalls = periodCalls.filter((c) => {
    const key = c.contactId ?? c.prospect ?? c.id
    return key === resolvedLeadKey
  })
  const leadOtherCalls = periodCalls.filter((c) => {
    const key = c.contactId ?? c.prospect ?? c.id
    return key !== resolvedLeadKey
  })
  const activeLead = leadOptions.find((l) => l.key === resolvedLeadKey)

  // Leads e calls ativos dependem da view
  const activeLeads = view === 'team' ? teamLeads : view === 'seller' ? sellerLeads : leadCalls
  const activeLeadCount = activeLeads.length
  const radarTrainerCalls = view === 'lead' ? leadPeriodCalls : trainerCalls
  const radarOtherCalls  = view === 'lead' ? leadOtherCalls  : otherCalls

  const leadsRangeLabel: Record<IntentDateRange, string> = {
    '1w': 'Last 7 days',
    '2w': 'Last 14 days',
    '15d': 'Last 15 days',
    '1m': 'Last 30 days',
  }
  const dateLabel = leadsRangeLabel[leadsRange]
  const leadsSubtitle = view === 'team'
    ? `${dateLabel} · ${activeLeadCount} ${activeLeadCount === 1 ? 'lead' : 'leads'} with intent > 3.5`
    : view === 'seller' && activeTrainer
      ? `${dateLabel} · ${activeTrainer.name.split(' ')[0]} · ${activeLeadCount} ${activeLeadCount === 1 ? 'lead' : 'leads'} with intent > 3.5`
      : view === 'lead' && activeLead
        ? `${dateLabel} · ${activeLead.name} · ${activeLeadCount} ${activeLeadCount === 1 ? 'call' : 'calls'}`
        : dateLabel

  return (
    <div className="flex flex-col gap-4">
      {/* ── Filtro global: Team / By Seller / By Lead ──────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-[13px] font-semibold" style={{ color: 'var(--am-text)' }}>
          Intent Dashboard
        </p>
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--am-bg3)' }}>
          {(['team', 'seller', 'lead'] as const).map((v) => (
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
              {v === 'team' ? 'Team' : v === 'seller' ? 'By Seller' : 'By Lead'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Seletor de seller (visível só na view "By Seller") ─── */}
      {view === 'seller' && trainers.length > 0 && (
        <div
          className="flex flex-wrap gap-1 p-1 rounded-xl w-fit"
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

      {/* ── Seletor de lead (visível só na view "By Lead") ──────── */}
      {view === 'lead' && leadOptions.length > 0 && (
        <div
          className="flex flex-wrap gap-1 p-1 rounded-xl w-fit"
          style={{ background: 'var(--am-bg3)' }}
        >
          {leadOptions.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setActiveLeadKey(l.key)}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150"
              style={{
                background: l.key === resolvedLeadKey ? 'var(--am-accent)' : 'transparent',
                color: l.key === resolvedLeadKey ? '#fff' : 'var(--am-muted)',
              }}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Card: Highest Priority Leads (acima) ───────────────── */}
      <div className="rounded-2xl border shadow-md p-5" style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}>
        {/* Header com filtro de período (default D-1) */}
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <p className="text-[13px] font-semibold" style={{ color: 'var(--am-text)' }}>
            {t('highestIntentLeads', { defaultValue: 'Highest Priority Leads' })}
          </p>
          <IntentPeriodTabs value={leadsRange} onChange={setLeadsRange} />
        </div>
        {loading ? (
          <p className="text-[12px]" style={{ color: 'var(--am-muted)' }}>
            {t('loading', { defaultValue: 'Loading...' })}
          </p>
        ) : (
          <LeadsList
            leads={activeLeads}
            locale={locale}
            emptyLabel={`No leads with intent above 3.5 in the ${dateLabel.toLowerCase()}`}
            title=""
            subtitle={leadsSubtitle}
            page={leadsPage}
            onPageChange={setLeadsPage}
          />
        )}
      </div>

      {/* ── Card: Radar (abaixo) ────────────────────────────────── */}
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
          <div className="px-5 pb-5">
            <IntentRadarChart
              calls={periodCalls}
              signals={signals}
              startDate={startDate}
              endDate={endDate}
              variant="compact"
            />
          </div>
        ) : view === 'seller' ? (
          /* ── By Seller view ─────────────────────────────────────── */
          <div className="px-5 pb-5">
            <TeamIntentRadarChart
              trainerCalls={radarTrainerCalls}
              teamCalls={radarOtherCalls}
              signals={signals}
              trainerName={activeTrainer?.name ?? ''}
              startDate={startDate}
              endDate={endDate}
            />
          </div>
        ) : (
          /* ── By Lead view ───────────────────────────────────────── */
          <div className="px-5 pb-5">
            <TeamIntentRadarChart
              trainerCalls={radarTrainerCalls}
              teamCalls={radarOtherCalls}
              signals={signals}
              trainerName={activeLead?.name ?? ''}
              startDate={startDate}
              endDate={endDate}
            />
          </div>
        )}
      </div>
    </div>
  )
}

const RESULT_LABEL: Record<string, { label: string; color: string }> = {
  closed:      { label: 'Closed',     color: 'var(--am-green)' },
  not_closed:  { label: 'Not Closed', color: 'var(--am-red)'   },
  partial:     { label: 'Partial',    color: 'var(--am-amber)'  },
  no_outcome:  { label: 'No Outcome', color: 'var(--am-muted)'  },
  follow_up:   { label: 'Follow Up',  color: 'var(--am-blue)'   },
}

const SOURCE_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  google: 'Google',
  organic: 'Organic',
  referral: 'Referral',
  other: 'Other',
}

function sig(bd: Record<string, number> | undefined | null, key: string): string {
  if (!bd) return '—'
  const v = bd[key]
  return v != null ? (v / 2).toFixed(1) : '—'
}

function formatEvalDate(call: Call, locale: string): string {
  const raw = call.callDate ?? call.date
  if (!raw) return '—'
  return new Date(raw).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

const LEADS_PAGE_SIZE = 10

function LeadsList({
  leads,
  locale,
  emptyLabel,
  title,
  subtitle,
  page,
  onPageChange,
}: {
  leads: (Call & { intentScore: number })[]
  locale: string
  emptyLabel: string
  title: string
  subtitle: string
  page: number
  onPageChange: (page: number) => void
}) {
  const COLS = ['Lead', 'Financial', 'Urgency', 'Authority', 'Engagement', 'Avg', 'Initial Result', 'Won', 'Source', 'Eval Date'] as const

  const totalPages = Math.max(1, Math.ceil(leads.length / LEADS_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageLeads = leads.slice((safePage - 1) * LEADS_PAGE_SIZE, safePage * LEADS_PAGE_SIZE)

  return (
    <div>
      {title && (
        <p className="text-[13px] font-semibold mb-0.5" style={{ color: 'var(--am-text)' }}>
          {title}
        </p>
      )}
      {subtitle && (
        <p className="text-[11px] mb-4" style={{ color: 'var(--am-muted)' }}>
          {subtitle}
        </p>
      )}

      {leads.length === 0 ? (
        <p className="text-[12px]" style={{ color: 'var(--am-muted)' }}>
          {emptyLabel}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
                {COLS.map((col) => (
                  <th
                    key={col}
                    className="pb-2 text-left font-medium pr-4 last:pr-0 whitespace-nowrap"
                    style={{ color: 'var(--am-muted)' }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageLeads.map((call) => {
                const bd = call.intentBreakdown as Record<string, number> | undefined | null
                const result = RESULT_LABEL[call.result] ?? RESULT_LABEL.no_outcome
                return (
                  <tr
                    key={call.id}
                    className="group transition-opacity hover:opacity-75 cursor-pointer"
                    style={{ borderBottom: '1px solid var(--am-border)' }}
                    onClick={() => { if (call.id) window.location.href = `/${locale}/calls/${call.id}` }}
                  >
                    {/* Lead name */}
                    <td className="py-2.5 pr-4 font-medium max-w-[140px]" style={{ color: 'var(--am-text)' }}>
                      <span className="block truncate">{call.prospect || '—'}</span>
                      <span className="block text-[10px] truncate" style={{ color: 'var(--am-muted)' }}>
                        {call.trainerName}
                      </span>
                    </td>
                    {/* Financial */}
                    <td className="py-2.5 pr-4 font-mono" style={{ color: 'var(--am-amber)' }}>
                      {sig(bd, 'financial')}
                    </td>
                    {/* Urgency */}
                    <td className="py-2.5 pr-4 font-mono" style={{ color: 'var(--am-red)' }}>
                      {sig(bd, 'urgency')}
                    </td>
                    {/* Authority */}
                    <td className="py-2.5 pr-4 font-mono" style={{ color: 'var(--am-blue)' }}>
                      {sig(bd, 'authority')}
                    </td>
                    {/* Engagement */}
                    <td className="py-2.5 pr-4 font-mono" style={{ color: 'var(--am-accent2)' }}>
                      {sig(bd, 'engagement')}
                    </td>
                    {/* Média ponderada */}
                    <td className="py-2.5 pr-4 font-mono font-bold" style={{ color: 'var(--am-green)' }}>
                      {intentIndexToDisplay(call.intentScore)}
                    </td>
                    {/* Initial Result */}
                    <td className="py-2.5 whitespace-nowrap">
                      <span
                        className="px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
                        style={{
                          background: result.color + '1a',
                          color: result.color,
                        }}
                      >
                        {result.label}
                      </span>
                    </td>
                    {/* Won (GHL Opportunity) */}
                    <td className="py-2.5 whitespace-nowrap">
                      {call.ghlWonStatus === 'won' ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                          style={{ background: 'rgba(34,217,160,0.12)', color: 'var(--am-green)' }}
                        >
                          Yes
                        </span>
                      ) : call.ghlWonStatus === 'lost' ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                          style={{ background: 'rgba(255,94,94,0.12)', color: 'var(--am-red)' }}
                        >
                          No
                        </span>
                      ) : (
                        <span style={{ color: 'var(--am-muted)' }}>—</span>
                      )}
                    </td>
                    {/* Source */}
                    <td className="py-2.5 pr-4 whitespace-nowrap" style={{ color: 'var(--am-muted)' }}>
                      {call.lead_source ? (SOURCE_LABEL[call.lead_source] ?? call.lead_source) : '—'}
                    </td>
                    {/* Eval Date — destacada; sinaliza quando a data vem de fallback do LLM (não do GHL) */}
                    <td className="py-2.5 whitespace-nowrap">
                      <span className="font-mono font-semibold" style={{ color: 'var(--am-text)' }}>
                        {formatEvalDate(call, locale)}
                      </span>
                      {call.evalDateSource === 'llm' && (
                        <span
                          className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-medium align-middle"
                          style={{ background: 'rgba(255,171,46,0.12)', color: 'var(--am-amber)' }}
                          title="Estimated from call transcript — not confirmed by GHL"
                        >
                          est.
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {leads.length > LEADS_PAGE_SIZE && (
        <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
          <p className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
            Showing {(safePage - 1) * LEADS_PAGE_SIZE + 1}–{Math.min(safePage * LEADS_PAGE_SIZE, leads.length)} of {leads.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => onPageChange(safePage - 1)}
              className="px-2.5 py-1 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40"
              style={{ background: 'var(--am-bg3)', color: 'var(--am-text)' }}
            >
              Prev
            </button>
            <span className="text-[11px] px-2" style={{ color: 'var(--am-muted)' }}>
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => onPageChange(safePage + 1)}
              className="px-2.5 py-1 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40"
              style={{ background: 'var(--am-bg3)', color: 'var(--am-text)' }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
