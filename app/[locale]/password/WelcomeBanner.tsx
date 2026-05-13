'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Sparkles, X } from 'lucide-react'

interface Props {
  // Destino do botão "Pular" — geralmente o home da role (/dashboard, /me).
  // Validado server-side (page.tsx); aqui usamos direto.
  skipHref: string
}

// Banner que aparece após o primeiro acesso via invite. Convida a definir
// senha (mostra o form abaixo) ou pular pra continuar usando magic link.
// Decisão Victor 2026-05-13: senha é opcional, magic link continua funcionando.
export function WelcomeBanner({ skipHref }: Props) {
  const t = useTranslations('Password.welcome')
  const locale = useLocale()
  const localizedSkip = `/${locale}${skipHref}`

  return (
    <div
      role="region"
      aria-label={t('aria')}
      className="rounded-2xl border p-5 mb-6 relative"
      style={{
        background: 'var(--am-accent2-bg, rgba(155,135,255,0.10))',
        borderColor: 'var(--am-accent2, #9b87ff)',
      }}
    >
      <Link
        href={localizedSkip}
        aria-label={t('close')}
        className="absolute top-3 right-3 opacity-60 hover:opacity-100 transition-opacity"
        style={{ color: 'var(--am-text)' }}
      >
        <X size={16} />
      </Link>
      <div className="flex items-start gap-3 pr-8">
        <div
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{
            width: '32px',
            height: '32px',
            background: 'var(--am-accent2-bg, rgba(155,135,255,0.18))',
            color: 'var(--am-accent2, #9b87ff)',
          }}
        >
          <Sparkles size={16} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--am-text)' }}>
            {t('title')}
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--am-muted)' }}>
            {t('body')}
          </p>
          <div className="flex items-center gap-3 mt-3">
            <Link
              href={localizedSkip}
              className="text-xs underline opacity-70 hover:opacity-100"
              style={{ color: 'var(--am-muted)' }}
            >
              {t('skip')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
