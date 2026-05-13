'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

interface Props {
  // Server resolve isImpersonating + nome da org via getActiveOrgContext.
  // Banner se mostra só quando ambos vêm preenchidos. Mantém o componente
  // burro — sem polling/refetch — porque o JWT só muda em transição
  // explícita (start/end impersonate) que já dispara router refresh.
  orgName: string | null
}

export function ImpersonationBanner({ orgName }: Props) {
  const t = useTranslations('Admin.impersonateBanner')
  const locale = useLocale()
  const [exiting, setExiting] = useState(false)

  if (!orgName) return null

  const handleExit = async () => {
    if (exiting) return
    setExiting(true)
    try {
      await fetch('/api/admin/impersonate', { method: 'DELETE' })
      const supabase = createClient()
      await supabase.auth.refreshSession()
      // Hard reload: o banner vive no root layout que Next não re-renderiza
      // em navegação client-side. Sem reload, sair do impersonate mantém
      // o banner visível até o próximo F5.
      window.location.href = `/${locale}/admin`
    } catch {
      setExiting(false)
    }
  }

  return (
    <div
      role="status"
      // z-[60] pra ficar acima do AppHeader (z-50, fixed top-0 h-[61px]).
      // O CSS var --impersonate-banner-h (setada no body em layout.tsx) empurra
      // o header e os mains pra baixo dessa altura — sem isso, banner cobre
      // o header.
      className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-3 px-4 py-2 text-[12px] font-medium"
      style={{
        background: 'var(--am-amber-bg, rgba(255,179,71,0.18))',
        borderBottom: '1px solid var(--am-amber, #d97706)',
        color: 'var(--am-amber, #d97706)',
        backdropFilter: 'blur(6px)',
        height: 'var(--impersonate-banner-h, 36px)',
      }}
    >
      <span aria-hidden>🔍</span>
      <span>
        {t('label')}: <strong>{orgName}</strong>
      </span>
      <span className="opacity-60">·</span>
      <span className="opacity-80">{t('readOnly')}</span>
      <span className="opacity-60">·</span>
      <button
        type="button"
        onClick={handleExit}
        disabled={exiting}
        className="underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
        style={{ color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
      >
        {exiting ? t('exiting') : t('exit')}
      </button>
    </div>
  )
}
