'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Settings, Webhook, Wand2 } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { Client, OrgScriptStatus, PlanCode } from '@/lib/types'

interface Props {
  client: Client
  isLast: boolean
  isSelected: boolean
  onToggleSelected: () => void
  onSendScript: () => void
  // Já formatada pelo caller pra evitar Date parsing em cada row.
  lastActivityDate: string
}

const planStyles: Record<PlanCode, { bg: string; color: string }> = {
  starter: { bg: 'var(--am-blue-bg)',                            color: 'var(--am-blue)'    },
  pro:     { bg: 'var(--am-accent2-bg, rgba(155,135,255,0.12))', color: 'var(--am-accent2)' },
  pro_rag: { bg: 'var(--am-green-bg)',                           color: 'var(--am-green)'   },
}

const planStatusStyles: Record<'active' | 'inactive' | 'trial', { bg: string; color: string }> = {
  active:   { bg: 'var(--am-green-bg)', color: 'var(--am-green)' },
  trial:    { bg: 'var(--am-blue-bg)',  color: 'var(--am-blue)'  },
  inactive: { bg: 'var(--am-red-bg)',   color: 'var(--am-red)'   },
}

const scriptStatusStyles: Record<OrgScriptStatus, { bg: string; color: string }> = {
  none:       { bg: 'var(--am-bg4)',     color: 'var(--am-muted)' },
  pending:    { bg: 'var(--am-amber-bg)', color: 'var(--am-amber)' },
  active:     { bg: 'var(--am-green-bg)', color: 'var(--am-green)' },
  deprecated: { bg: 'var(--am-red-bg)',  color: 'var(--am-red)'   },
  rejected:   { bg: 'var(--am-bg4)',     color: 'var(--am-muted)' },
}

// Linha clicável do painel admin. Click → POST /api/admin/impersonate →
// refreshSession (pra o JWT trazer impersonating_org_id) → redirect /dashboard.
// Sem o refreshSession, current_org() no próximo request ainda retorna NULL
// pq o JWT antigo continua válido até a próxima rotação natural.
//
// Children interactivos (checkbox, action buttons, settings link) param
// propagation pra não disparar impersonate por bubbling.
export function AdminOrgRow({
  client,
  isLast,
  isSelected,
  onToggleSelected,
  onSendScript,
  lastActivityDate,
}: Props) {
  const t = useTranslations('Admin')
  const tTools = useTranslations('Admin.tableTools')
  const tStatusPlan = useTranslations('Admin.statusBadge')
  const tStatusScript = useTranslations('Admin.scriptStatus')
  const locale = useLocale()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const script = client.currentScript
  const scriptStatus: OrgScriptStatus = script?.status ?? 'none'
  const planStyle = planStyles[client.plan.code] ?? planStyles.starter
  const planStatusStyle = planStatusStyles[client.subscriptionStatus]
  const scriptStatusStyle = scriptStatusStyles[scriptStatus]

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: client.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? t('impersonateError'))
        setLoading(false)
        return
      }
      // refresh do JWT — sem isso current_org() lê do token antigo.
      const supabase = createClient()
      await supabase.auth.refreshSession()
      // Hard reload via window.location: o banner vive no root layout
      // [locale]/layout.tsx que Next.js NÃO re-renderiza em navegação
      // client-side (router.push). Sem reload, o usuário entra na org
      // mas o banner não aparece até o próximo F5.
      window.location.href = `/${locale}/dashboard`
    } catch {
      setError(t('impersonateError'))
      setLoading(false)
    }
  }

  return (
    <tr
      onClick={handleClick}
      role="button"
      tabIndex={loading ? -1 : 0}
      aria-disabled={loading}
      title={t('impersonateTooltip', { name: client.name })}
      onKeyDown={(e) => {
        if (loading || e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          void handleClick()
        }
      }}
      style={{
        borderBottom: isLast ? 'none' : '1px solid var(--am-border)',
        cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.6 : 1,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!loading) e.currentTarget.style.background = 'var(--am-bg3)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
      onFocus={(e) => {
        if (!loading && e.target === e.currentTarget) e.currentTarget.style.background = 'var(--am-bg3)'
      }}
      onBlur={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <td className="w-8 px-3 py-4" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelected}
          aria-label={tTools('selectRow', { name: client.name })}
          style={{ accentColor: 'var(--am-accent)' }}
        />
      </td>

      <td className="px-5 py-4">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
            {client.name}
          </p>
          {!client.ownerAccepted && (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full font-mono uppercase tracking-wide"
              style={{
                background: 'var(--am-amber-bg, rgba(255,179,71,0.18))',
                color: 'var(--am-amber, #d97706)',
              }}
            >
              {t('ownerPending')}
            </span>
          )}
        </div>
        {error && (
          <p className="text-[11px] mt-1" style={{ color: 'var(--am-red)' }}>{error}</p>
        )}
      </td>

      {/* Script Version: mostra "v1.5" ou "v2.0 → v2.1" quando pending com previous */}
      <td className="px-5 py-4 whitespace-nowrap">
        {script ? (
          <div className="inline-flex items-center gap-1.5 font-mono text-[11px] whitespace-nowrap">
            {script.previousVersion && (
              <>
                <span
                  className="px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--am-bg4)', color: 'var(--am-muted)' }}
                >
                  v{script.previousVersion}
                </span>
                <span style={{ color: 'var(--am-muted)' }}>→</span>
              </>
            )}
            <span
              className="px-1.5 py-0.5 rounded font-medium"
              style={{ background: scriptStatusStyle.bg, color: scriptStatusStyle.color }}
            >
              v{script.version}
            </span>
          </div>
        ) : (
          <span className="text-[12px] font-mono" style={{ color: 'var(--am-muted)' }}>—</span>
        )}
      </td>

      {/* Status do script */}
      <td className="px-5 py-4 whitespace-nowrap">
        <span
          className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full font-mono uppercase tracking-wide whitespace-nowrap"
          style={{ background: scriptStatusStyle.bg, color: scriptStatusStyle.color }}
        >
          {tStatusScript(scriptStatus)}
        </span>
      </td>

      {/* Plan */}
      <td className="px-5 py-4 whitespace-nowrap">
        <span
          className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full font-mono whitespace-nowrap"
          style={{ background: planStyle.bg, color: planStyle.color }}
        >
          {client.plan.name}
        </span>
      </td>

      {/* Plan Status (active/trial/inactive) */}
      <td className="px-5 py-4 whitespace-nowrap">
        <span
          className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full font-mono uppercase tracking-wide whitespace-nowrap"
          style={{ background: planStatusStyle.bg, color: planStatusStyle.color }}
        >
          {tStatusPlan(client.subscriptionStatus)}
        </span>
      </td>

      {/* Sales people */}
      <td className="px-5 py-4">
        <span className="text-sm font-mono" style={{ color: 'var(--am-text)' }}>
          {client.trainersCount}
        </span>
      </td>

      {/* MRR */}
      <td className="px-5 py-4">
        <span className="text-sm font-mono" style={{ color: 'var(--am-text)' }}>
          ${client.mrr.toLocaleString()}
        </span>
      </td>

      {/* Last Activity */}
      <td className="px-5 py-4 whitespace-nowrap">
        <span className="text-[12px] font-mono" style={{ color: 'var(--am-muted)' }}>
          {lastActivityDate}
        </span>
      </td>
      <td className="px-3 py-4 text-right">
        {/* stopPropagation pra não disparar o impersonate da row inteira */}
        <div className="inline-flex items-center gap-1">
          {script && (
            <Link
              href={`/${locale}/admin/script-review`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Improve script for ${client.name}`}
              title={`Improve script for ${client.name}`}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:opacity-80 transition-opacity"
              style={{ color: 'var(--am-accent2)' }}
            >
              <Wand2 size={14} />
            </Link>
          )}
          <Link
            href={`/${locale}/admin/organizations/${client.id}/integrations/ghl`}
            onClick={(e) => e.stopPropagation()}
            aria-label={t('ghlSettings', { name: client.name })}
            title={t('ghlSettings', { name: client.name })}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:opacity-80 transition-opacity"
            style={{ color: 'var(--am-muted)' }}
          >
            <Webhook size={14} />
          </Link>
          <Link
            href={`/${locale}/admin/organizations/${client.id}/subscription`}
            onClick={(e) => e.stopPropagation()}
            aria-label={t('subscriptionSettings', { name: client.name })}
            title={t('subscriptionSettings', { name: client.name })}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:opacity-80 transition-opacity"
            style={{ color: 'var(--am-muted)' }}
          >
            <Settings size={14} />
          </Link>
        </div>
      </td>
    </tr>
  )
}
