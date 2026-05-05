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

// OrgSwitcher (TC-06 / TC-07)
//   Aparece só quando o user tem 2+ memberships aceitas. 1 só → render
//   nada (a UI não tem o que oferecer). Troca via POST /api/me/active-org
//   e força refresh pra reconstruir RLS context server-side.
const HOME_BY_ROLE: Record<MembershipOption['role'], string> = {
  owner: '/dashboard',
  trainer: '/me',
}

export function OrgSwitcher() {
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
        // refreshSession pega o novo JWT (app_metadata.role pode mudar pra
        // dual-role). Vai pra home da nova role — evita ficar numa página
        // proibida pelo middleware (ex.: trainer→owner switch parado em /me).
        const data = (await res.json()) as { data?: { role: MembershipOption['role'] } }
        const supabase = createClient()
        await supabase.auth.refreshSession()
        const home = data.data ? HOME_BY_ROLE[data.data.role] : '/dashboard'
        window.location.href = `/${locale}${home}`
      }
    })
  }

  return (
    <label
      className="hidden md:flex items-center gap-2 px-2 py-1 rounded-md border text-xs font-medium"
      style={{
        background: 'var(--am-bg3)',
        borderColor: 'var(--am-border2)',
        color: 'var(--am-text)',
      }}
      title={t('label')}
      aria-busy={isPending}
    >
      <Building2 size={14} style={{ color: 'var(--am-muted)' }} aria-hidden />
      <span className="sr-only">{t('label')}</span>
      <select
        value={payload.activeOrgId ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="bg-transparent outline-none text-xs font-medium cursor-pointer pr-1"
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
