'use client'

import { useEffect, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface MembershipOption {
  orgId: string
  orgName: string
  role: 'owner' | 'trainer'
}

interface SwitcherPayload {
  memberships: MembershipOption[]
  activeOrgId: string | null
}

interface OrgSwitcherProps {
  /**
   * 'header'  — pílula compacta no header, hidden md:flex (desktop apenas).
   * 'sidebar' — bloco full-width, usado dentro do Sheet mobile pra cobrir
   *             o caso onde o header não exibe (telas < md).
   */
  variant?: 'header' | 'sidebar'
}

const HOME_BY_ROLE: Record<MembershipOption['role'], string> = {
  owner: '/dashboard',
  trainer: '/me',
}

// OrgSwitcher (TC-06 / TC-07)
//   Renderiza só quando o user tem 2+ memberships aceitas. Troca via
//   POST /api/me/active-org + refreshSession() pra pegar o novo JWT
//   (role pode mudar em dual-role) e redireciona pra home da nova role.
export function OrgSwitcher({ variant = 'header' }: OrgSwitcherProps) {
  const t = useTranslations('Shared.header.orgSwitcher')
  const locale = useLocale()
  const [payload, setPayload] = useState<SwitcherPayload | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    fetch('/api/me/memberships')
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return
        if (res?.data) setPayload(res.data as SwitcherPayload)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!payload || payload.memberships.length < 2) return null

  const handleChange = (orgId: string) => {
    if (orgId === payload.activeOrgId) return
    startTransition(async () => {
      const res = await fetch('/api/me/active-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      })
      if (res.ok) {
        const data = (await res.json()) as { data?: { role: MembershipOption['role'] } }
        const supabase = createClient()
        await supabase.auth.refreshSession()
        const home = data.data ? HOME_BY_ROLE[data.data.role] : '/dashboard'
        window.location.href = `/${locale}${home}`
      }
    })
  }

  const isHeader = variant === 'header'

  return (
    <label
      className={
        isHeader
          ? 'hidden md:flex items-center gap-2 px-2 py-1 rounded-md border text-xs font-medium'
          : 'flex w-full items-center gap-2 px-3 py-2.5 rounded-md border text-sm font-medium'
      }
      style={{
        background: 'var(--am-bg3)',
        borderColor: 'var(--am-border2)',
        color: 'var(--am-text)',
      }}
      title={t('label')}
      aria-busy={isPending}
    >
      <Building2 size={isHeader ? 14 : 16} style={{ color: 'var(--am-muted)' }} aria-hidden />
      <span className={isHeader ? 'sr-only' : 'sr-only md:hidden'}>{t('label')}</span>
      <select
        value={payload.activeOrgId ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className={
          isHeader
            ? 'bg-transparent outline-none text-xs font-medium cursor-pointer pr-1'
            : 'bg-transparent outline-none text-sm font-medium cursor-pointer flex-1'
        }
        style={{ color: 'var(--am-text)' }}
      >
        {payload.memberships.map((m) => (
          <option key={m.orgId} value={m.orgId}>
            {m.orgName} · {t(m.role)}
          </option>
        ))}
      </select>
    </label>
  )
}
