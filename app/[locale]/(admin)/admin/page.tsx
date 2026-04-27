export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { getClients } from '@/lib/services/clients'
import { ScoreCard } from '@/components/shared/ScoreCard'
import { SectionLabel } from '@/components/shared/SectionLabel'
import type { HealthStatus, PlanCode } from '@/lib/types'

const healthStyles: Record<HealthStatus, { bg: string; color: string; key: 'healthy' | 'atRisk' | 'churning' }> = {
  healthy:  { bg: 'var(--am-green-bg)', color: 'var(--am-green)', key: 'healthy' },
  'at-risk':{ bg: 'var(--am-amber-bg)', color: 'var(--am-amber)', key: 'atRisk' },
  churning: { bg: 'var(--am-red-bg)',   color: 'var(--am-red)',   key: 'churning' },
}

const planStyles: Record<PlanCode, { bg: string; color: string }> = {
  starter: { bg: 'var(--am-blue-bg)',                            color: 'var(--am-blue)'    },
  pro:     { bg: 'var(--am-accent2-bg, rgba(155,135,255,0.12))', color: 'var(--am-accent2)' },
  pro_rag: { bg: 'var(--am-green-bg)',                           color: 'var(--am-green)'   },
}

export default async function AdminPage() {
  const [{ clients, metrics }, t, tMetrics, tTh, tHealth] = await Promise.all([
    getClients(),
    getTranslations('Admin'),
    getTranslations('Admin.metrics'),
    getTranslations('Admin.th'),
    getTranslations('Admin.health'),
  ])

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="mb-6">
        <SectionLabel>{t('saasPanel')}</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {t('globalOverview')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
          {t('allClientsDate')}
        </p>
      </div>

      {/* ── Global metrics ────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <ScoreCard
          label={tMetrics('totalClients')}
          value={metrics.totalClients}
          deltaLabel={tMetrics('activeAccounts')}
        />
        <ScoreCard
          label={tMetrics('callsThisMonth')}
          value={metrics.totalCallsThisMonth}
          delta={23}
          deltaLabel={tMetrics('vsLastMonth')}
        />
        <ScoreCard
          label={tMetrics('mrr')}
          value={`$${metrics.totalMRR.toLocaleString()}`}
          valueColor="var(--am-green)"
          delta={297}
          deltaLabel={tMetrics('vsLastMonth')}
        />
        <ScoreCard
          label={tMetrics('avgScore')}
          value={metrics.avgScore}
          valueColor="var(--am-accent2)"
          delta={4}
          deltaLabel={tMetrics('ptsVsLastMonth')}
        />
      </div>

      {/* ── Clients table ─────────────────────────────────────── */}
      <SectionLabel>{t('clientsLabel')}</SectionLabel>
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
                {(['client', 'plan', 'salesPeople', 'callsPerMonth', 'avgScore', 'mrr', 'health'] as const).map((k) => (
                  <th
                    key={k}
                    className="text-[11px] font-medium text-left px-5 py-3"
                    style={{ color: 'var(--am-muted)' }}
                  >
                    {tTh(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((client, i) => {
                const health = healthStyles[client.health]
                const plan   = planStyles[client.plan.code] ?? planStyles.starter
                return (
                  <tr
                    key={client.id}
                    style={{
                      borderBottom: i < clients.length - 1 ? '1px solid var(--am-border)' : 'none',
                    }}
                  >
                    {/* Client name */}
                    <td className="px-5 py-4">
                      <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
                        {client.name}
                      </p>
                    </td>

                    {/* Plan */}
                    <td className="px-5 py-4">
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full font-mono"
                        style={{ background: plan.bg, color: plan.color }}
                      >
                        {client.plan.name}
                      </span>
                    </td>

                    {/* Trainers count */}
                    <td className="px-5 py-4">
                      <span className="text-sm font-mono" style={{ color: 'var(--am-text)' }}>
                        {client.trainersCount}
                      </span>
                    </td>

                    {/* Calls */}
                    <td className="px-5 py-4">
                      <span className="text-sm font-mono" style={{ color: 'var(--am-text)' }}>
                        {client.callsThisMonth}
                      </span>
                    </td>

                    {/* Avg score */}
                    <td className="px-5 py-4">
                      <span
                        className="text-sm font-semibold font-mono"
                        style={{
                          color:
                            client.avgScore >= 85
                              ? 'var(--am-green)'
                              : client.avgScore >= 75
                              ? 'var(--am-amber)'
                              : 'var(--am-red)',
                        }}
                      >
                        {client.avgScore}
                      </span>
                    </td>

                    {/* MRR */}
                    <td className="px-5 py-4">
                      <span className="text-sm font-mono" style={{ color: 'var(--am-text)' }}>
                        ${client.mrr.toLocaleString()}
                      </span>
                    </td>

                    {/* Health */}
                    <td className="px-5 py-4">
                      <span
                        className="text-[11px] font-medium px-2.5 py-1 rounded-full font-mono"
                        style={{ background: health.bg, color: health.color }}
                      >
                        {tHealth(health.key)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
