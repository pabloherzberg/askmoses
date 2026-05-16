'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Settings } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { scoreColorVar, toDisplay5 } from '@/lib/score-display'
import type { Client } from '@/lib/types'

interface Props {
  client: Client
  isLast: boolean
  styles: {
    health: { bg: string; color: string; key: 'healthy' | 'atRisk' | 'churning' }
    plan: { bg: string; color: string }
  }
  healthLabel: string
}

// Linha clicável do painel admin. Click → POST /api/admin/impersonate →
// refreshSession (pra o JWT trazer impersonating_org_id) → redirect /dashboard.
// Sem o refreshSession, current_org() no próximo request ainda retorna NULL
// pq o JWT antigo continua válido até a próxima rotação natural.
export function AdminOrgRow({ client, isLast, styles, healthLabel }: Props) {
  const t = useTranslations('Admin')
  const locale = useLocale()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      // A row é a ação primária (impersonate). Como <tr> não é focável nem
      // acionável por teclado, expomos role=button + tabIndex + Enter/Espaço
      // pra quem navega sem mouse. O guard target===currentTarget evita que
      // teclas no <Link> de settings (que tem o próprio handler) disparem o
      // impersonate por bubbling.
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
          {client.subscriptionStatus === 'trial' && (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full font-mono uppercase tracking-wide"
              style={{
                background: 'var(--am-blue-bg)',
                color: 'var(--am-blue)',
              }}
            >
              {t('subTrial')}
            </span>
          )}
          {client.subscriptionStatus === 'inactive' && (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full font-mono uppercase tracking-wide"
              style={{
                background: 'var(--am-red-bg)',
                color: 'var(--am-red)',
              }}
            >
              {t('subInactive')}
            </span>
          )}
        </div>
        {error && (
          <p className="text-[11px] mt-1" style={{ color: 'var(--am-red)' }}>{error}</p>
        )}
      </td>
      <td className="px-5 py-4">
        <span
          className="text-[11px] font-medium px-2 py-0.5 rounded-full font-mono"
          style={{ background: styles.plan.bg, color: styles.plan.color }}
        >
          {client.plan.name}
        </span>
      </td>
      <td className="px-5 py-4">
        <span className="text-sm font-mono" style={{ color: 'var(--am-text)' }}>
          {client.trainersCount}
        </span>
      </td>
      <td className="px-5 py-4">
        <span className="text-sm font-mono" style={{ color: 'var(--am-text)' }}>
          {client.callsThisMonth}
        </span>
      </td>
      <td className="px-5 py-4">
        <span
          className="text-sm font-semibold font-mono"
          style={{ color: scoreColorVar(client.avgScore) }}
        >
          {toDisplay5(client.avgScore)}
        </span>
      </td>
      <td className="px-5 py-4">
        <span className="text-sm font-mono" style={{ color: 'var(--am-text)' }}>
          ${client.mrr.toLocaleString()}
        </span>
      </td>
      <td className="px-5 py-4">
        <span
          className="text-[11px] font-medium px-2.5 py-1 rounded-full font-mono"
          style={{ background: styles.health.bg, color: styles.health.color }}
        >
          {healthLabel}
        </span>
      </td>
      <td className="px-3 py-4 text-right">
        {/* stopPropagation pra não disparar o impersonate da row inteira */}
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
      </td>
    </tr>
  )
}
