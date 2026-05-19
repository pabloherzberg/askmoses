export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { getClients } from '@/lib/services/clients'
import { ScoreCard } from '@/components/shared/ScoreCard'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { toDisplay5 } from '@/lib/score-display'
import { AdminOrgRow } from './AdminOrgRow'
import type { PlanCode } from '@/lib/types'

const planStyles: Record<PlanCode, { bg: string; color: string }> = {
  starter: { bg: 'var(--am-blue-bg)',                            color: 'var(--am-blue)'    },
  pro:     { bg: 'var(--am-accent2-bg, rgba(155,135,255,0.12))', color: 'var(--am-accent2)' },
  pro_rag: { bg: 'var(--am-green-bg)',                           color: 'var(--am-green)'   },
}

const statusStyles: Record<'active' | 'inactive' | 'trial', { bg: string; color: string }> = {
  active:   { bg: 'var(--am-green-bg)', color: 'var(--am-green)' },
  trial:    { bg: 'var(--am-blue-bg)',  color: 'var(--am-blue)'  },
  inactive: { bg: 'var(--am-red-bg)',   color: 'var(--am-red)'   },
}

export default async function AdminPage() {
  const [{ clients, metrics }, t, tMetrics, tTh, tStatus] = await Promise.all([
    getClients(),
    getTranslations('Admin'),
    getTranslations('Admin.metrics'),
    getTranslations('Admin.th'),
    getTranslations('Admin.statusBadge'),
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
          value={toDisplay5(metrics.avgScore)}
          valueColor="var(--am-accent2)"
          delta={4}
          deltaLabel={tMetrics('ptsVsLastMonth')}
        />
      </div>

      {/* ── All organizations table ───────────────────────────── */}
      <SectionLabel>{t('allOrganizationsLabel')}</SectionLabel>
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
                {(['client', 'status', 'plan', 'salesPeople', 'mrr'] as const).map((k) => (
                  <th
                    key={k}
                    className="text-[11px] font-medium text-left px-5 py-3"
                    style={{ color: 'var(--am-muted)' }}
                  >
                    {tTh(k)}
                  </th>
                ))}
                <th
                  className="text-[11px] font-medium text-right px-3 py-3"
                  style={{ color: 'var(--am-muted)' }}
                  aria-label={tTh('actions')}
                />
              </tr>
            </thead>
            <tbody>
              {clients.map((client, i) => {
                const plan = planStyles[client.plan.code] ?? planStyles.starter
                const status = statusStyles[client.subscriptionStatus]
                return (
                  <AdminOrgRow
                    key={client.id}
                    client={client}
                    isLast={i === clients.length - 1}
                    styles={{ plan, status }}
                    statusLabel={tStatus(client.subscriptionStatus)}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
