import { getClients } from '@/lib/services/clients'
import { ScoreCard } from '@/components/shared/ScoreCard'
import { SectionLabel } from '@/components/shared/SectionLabel'
import type { HealthStatus } from '@/lib/types'

const healthStyles: Record<HealthStatus, { bg: string; color: string; label: string }> = {
  healthy:  { bg: 'var(--am-green-bg)', color: 'var(--am-green)', label: 'Healthy' },
  'at-risk':{ bg: 'var(--am-amber-bg)', color: 'var(--am-amber)', label: 'At Risk' },
  churning: { bg: 'var(--am-red-bg)',   color: 'var(--am-red)',   label: 'Critical' },
}

const planStyles: Record<string, { bg: string; color: string }> = {
  'Starter':  { bg: 'var(--am-blue-bg)',  color: 'var(--am-blue)'  },
  'Pro':      { bg: 'var(--am-accent2-bg, rgba(155,135,255,0.12))', color: 'var(--am-accent2)' },
  'Pro+RAG':  { bg: 'var(--am-green-bg)', color: 'var(--am-green)' },
}

export default async function AdminPage() {
  const { clients, metrics } = await getClients()

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="mb-6">
        <SectionLabel>SaaS Panel</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          Global Overview
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
          All clients · March 2026
        </p>
      </div>

      {/* ── Global metrics ────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <ScoreCard
          label="Total Clients"
          value={metrics.totalClients}
          deltaLabel="active accounts"
        />
        <ScoreCard
          label="Calls This Month"
          value={metrics.totalCallsThisMonth}
          delta={23}
          deltaLabel="vs last month"
        />
        <ScoreCard
          label="MRR"
          value={`$${metrics.totalMRR.toLocaleString()}`}
          valueColor="var(--am-green)"
          delta={297}
          deltaLabel="vs last month"
        />
        <ScoreCard
          label="Avg Score"
          value={metrics.avgScore}
          valueColor="var(--am-accent2)"
          delta={4}
          deltaLabel="pts vs last month"
        />
      </div>

      {/* ── Clients table ─────────────────────────────────────── */}
      <SectionLabel>Clients</SectionLabel>
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
                {[
                  { label: 'Client',     mobile: true  },
                  { label: 'Plan',       mobile: false },
                  { label: 'Trainers',   mobile: false },
                  { label: 'Calls / mo', mobile: false },
                  { label: 'Avg Score',  mobile: true  },
                  { label: 'MRR',        mobile: false },
                  { label: 'Health',     mobile: true  },
                ].map(({ label, mobile }) => (
                  <th
                    key={label}
                    className={`text-[11px] font-medium text-left px-4 sm:px-5 py-3${mobile ? '' : ' hidden sm:table-cell'}`}
                    style={{ color: 'var(--am-muted)' }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((client, i) => {
                const health = healthStyles[client.health]
                const plan   = planStyles[client.plan] ?? planStyles['Starter']
                return (
                  <tr
                    key={client.id}
                    style={{
                      borderBottom: i < clients.length - 1 ? '1px solid var(--am-border)' : 'none',
                    }}
                  >
                    {/* Client name */}
                    <td className="px-4 sm:px-5 py-3.5">
                      <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
                        {client.name}
                      </p>
                    </td>

                    {/* Plan */}
                    <td className="px-4 sm:px-5 py-3.5 hidden sm:table-cell">
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full font-mono"
                        style={{ background: plan.bg, color: plan.color }}
                      >
                        {client.plan}
                      </span>
                    </td>

                    {/* Trainers count */}
                    <td className="px-4 sm:px-5 py-3.5 hidden sm:table-cell">
                      <span className="text-sm font-mono" style={{ color: 'var(--am-text)' }}>
                        {client.trainersCount}
                      </span>
                    </td>

                    {/* Calls */}
                    <td className="px-4 sm:px-5 py-3.5 hidden sm:table-cell">
                      <span className="text-sm font-mono" style={{ color: 'var(--am-text)' }}>
                        {client.callsThisMonth}
                      </span>
                    </td>

                    {/* Avg score */}
                    <td className="px-4 sm:px-5 py-3.5">
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
                    <td className="px-4 sm:px-5 py-3.5 hidden sm:table-cell">
                      <span className="text-sm font-mono" style={{ color: 'var(--am-text)' }}>
                        ${client.mrr.toLocaleString()}
                      </span>
                    </td>

                    {/* Health */}
                    <td className="px-4 sm:px-5 py-3.5">
                      <span
                        className="text-[11px] font-medium px-2.5 py-1 rounded-full font-mono"
                        style={{ background: health.bg, color: health.color }}
                      >
                        {health.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
      </div>
    </div>
  )
}
