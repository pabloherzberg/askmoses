export const dynamic = 'force-dynamic'

import { Building2, AlertCircle, Phone, BarChart3 } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getClientsPage, getGlobalMetrics } from '@/lib/services/clients'
import { toDisplay5 } from '@/lib/score-display'
import { AdminPanelTabs } from './AdminPanelTabs'

// Page size default. Coordenar com o limit que AdminPanelClient usa quando
// (re)fetcha — manter consistente pra paginação não pular itens.
const INITIAL_PAGE_SIZE = 25

export default async function AdminPage() {
  // Fetch inicial: primeira página sem filtros + métricas globais. O
  // AdminPanelClient assume dali e refetcha quando o user muda filtros.
  const [initialPage, metrics, t, tCards] = await Promise.all([
    getClientsPage({ page: 1, limit: INITIAL_PAGE_SIZE }),
    getGlobalMetrics(),
    getTranslations('Admin'),
    getTranslations('Admin.cards'),
  ])

  // Pending count vem da primeira página por simplicidade. Pra ser preciso
  // de fato (independente de paginação), precisaria de query agregada
  // separada — fica como nice-to-have. Pra demo com poucos orgs, page 1
  // contém todas as pendentes mesmo.
  const pendingCount = initialPage.rows.filter(
    (c) => c.currentScript?.status === 'pending',
  ).length

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {t('globalOverview')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
          {t('subtitleScriptIntel')}
        </p>
      </div>

      {/* ── Metric cards (todos informativos, não clicáveis) ──── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard
          label={tCards('totalOrgs')}
          value={metrics.totalClients.toString()}
          accent="var(--am-blue)"
          bg="var(--am-blue-bg)"
          icon={<Building2 size={16} />}
        />
        <MetricCard
          label={tCards('pendingApprovals')}
          value={pendingCount.toString()}
          accent="var(--am-amber)"
          bg="var(--am-amber-bg)"
          icon={<AlertCircle size={16} />}
        />
        <MetricCard
          label={tCards('totalCalls')}
          value={metrics.totalCallsThisMonth.toLocaleString()}
          accent="var(--am-green)"
          bg="var(--am-green-bg)"
          icon={<Phone size={16} />}
        />
        <MetricCard
          label={tCards('avgScore')}
          value={`${toDisplay5(metrics.avgScore)}%`}
          accent="var(--am-accent2)"
          bg="var(--am-accent2-bg, rgba(155,135,255,0.12))"
          icon={<BarChart3 size={16} />}
        />
      </div>

      {/* ── Tabs: Organizations | Scripts ─────────────────────── */}
      <AdminPanelTabs
        initialRows={initialPage.rows}
        initialTotal={initialPage.total}
        initialPageSize={INITIAL_PAGE_SIZE}
      />
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: string
  accent: string
  bg: string
  icon: React.ReactNode
}

function MetricCard({ label, value, accent, bg, icon }: MetricCardProps) {
  return (
    <div
      className="rounded-2xl border px-5 py-4 flex items-start justify-between gap-3"
      style={{
        background: 'var(--am-bg2)',
        borderColor: 'var(--am-border)',
      }}
    >
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--am-muted)' }}>
          {label}
        </p>
        <p className="text-2xl font-mono font-semibold mt-1" style={{ color: 'var(--am-text)' }}>
          {value}
        </p>
      </div>
      <div
        className="w-9 h-9 rounded-md inline-flex items-center justify-center shrink-0"
        style={{ background: bg, color: accent }}
      >
        {icon}
      </div>
    </div>
  )
}
