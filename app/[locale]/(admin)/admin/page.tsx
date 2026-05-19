export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Building2, AlertCircle, Phone, BarChart3 } from 'lucide-react'
import { getTranslations, getLocale } from 'next-intl/server'
import { getClients } from '@/lib/services/clients'
import { toDisplay5 } from '@/lib/score-display'
import { AdminPanelClient } from './AdminPanelClient'
import type { OrgScriptStatus } from '@/lib/types'

interface PageProps {
  searchParams: Promise<{ filter?: string }>
}

// resolveInitialFilter normaliza ?filter na URL pra um OrgScriptStatus
// válido (ou 'all'). Aceita só os valores conhecidos pra evitar
// hidratação inconsistente entre server e client.
function resolveInitialFilter(raw: string | undefined): OrgScriptStatus | 'all' {
  const valid: Array<OrgScriptStatus | 'all'> = [
    'all', 'none', 'pending', 'active', 'deprecated', 'rejected',
  ]
  return (valid as string[]).includes(raw ?? '')
    ? (raw as OrgScriptStatus | 'all')
    : 'all'
}

export default async function AdminPage({ searchParams }: PageProps) {
  const [{ clients, metrics }, t, tCards, locale, params] = await Promise.all([
    getClients(),
    getTranslations('Admin'),
    getTranslations('Admin.cards'),
    getLocale(),
    searchParams,
  ])

  const initialFilter = resolveInitialFilter(params.filter)
  const pendingCount = clients.filter((c) => c.currentScript?.status === 'pending').length

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
        {/* Pending approvals: clicável, leva pra /admin?filter=pending. */}
        <Link href={`/${locale}/admin?filter=pending`} className="block">
          <MetricCard
            label={tCards('pendingApprovals')}
            value={pendingCount.toString()}
            accent="var(--am-amber)"
            bg="var(--am-amber-bg)"
            icon={<AlertCircle size={16} />}
            interactive
          />
        </Link>
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

      {/* ── All organizations table + tools (client-side state) ─── */}
      <h2 className="text-[15px] font-semibold tracking-tight mb-3" style={{ color: 'var(--am-text)' }}>
        {t('allOrganizationsLabel')}
      </h2>

      <AdminPanelClient clients={clients} initialScriptFilter={initialFilter} />
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: string
  accent: string
  bg: string
  icon: React.ReactNode
  interactive?: boolean
}

// MetricCard local — duplicado mas pequeno; manter próximo da page evita
// over-engineering pra um padrão usado só aqui.
function MetricCard({ label, value, accent, bg, icon, interactive }: MetricCardProps) {
  return (
    <div
      className="rounded-2xl border px-5 py-4 flex items-start justify-between gap-3"
      style={{
        background: 'var(--am-bg2)',
        borderColor: 'var(--am-border)',
        cursor: interactive ? 'pointer' : 'default',
        transition: 'background 0.15s',
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
