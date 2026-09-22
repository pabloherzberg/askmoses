'use client'

import { useTranslations } from 'next-intl'
import { ShieldCheck } from 'lucide-react'

// Banner do primeiro acesso. Senha é obrigatória pra todo mundo (decisão
// Victor 2026-09-22) — sem "Pular": o middleware trava em /password enquanto
// app_metadata.password_set === false.
export function WelcomeBanner() {
  const t = useTranslations('Password.welcome')

  return (
    <div
      role="region"
      aria-label={t('aria')}
      className="rounded-2xl border p-5 mb-6"
      style={{
        background: 'var(--am-accent2-bg, rgba(155,135,255,0.10))',
        borderColor: 'var(--am-accent2, #9b87ff)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{
            width: '32px',
            height: '32px',
            background: 'var(--am-accent2-bg, rgba(155,135,255,0.18))',
            color: 'var(--am-accent2, #9b87ff)',
          }}
        >
          <ShieldCheck size={16} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--am-text)' }}>
            {t('title')}
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--am-muted)' }}>
            {t('body')}
          </p>
        </div>
      </div>
    </div>
  )
}
