'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Sparkles, ShieldCheck, X } from 'lucide-react'

interface Props {
  // Destino do botão "Pular" — geralmente o home da role (/dashboard, /me).
  // Validado server-side (page.tsx); aqui usamos direto.
  skipHref: string
  // Quando true, a definição de senha é obrigatória pra prosseguir:
  // esconde o botão "Pular" e troca o texto pra deixar isso explícito.
  // Usado pelo middleware quando role=owner && password_set !== true.
  forced?: boolean
}

// Banner que aparece após o primeiro acesso via invite ou quando o middleware
// força a definição de senha (forced=true).
//
// Modo opcional (forced=false): mostra "Pular" — decisão Victor 2026-05-13,
// senha é opcional pra trainer. Modo obrigatório: owner precisa definir antes
// de acessar qualquer rota protegida.
export function WelcomeBanner({ skipHref, forced = false }: Props) {
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
      {!forced && (
        <Link
          href={localizedSkip}
          aria-label={t('close')}
          className="absolute top-3 right-3 opacity-60 hover:opacity-100 transition-opacity"
          style={{ color: 'var(--am-text)' }}
        >
          <X size={16} />
        </Link>
      )}
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
          {forced ? <ShieldCheck size={16} /> : <Sparkles size={16} />}
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--am-text)' }}>
            {forced ? t('forcedTitle') : t('title')}
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--am-muted)' }}>
            {forced ? t('forcedBody') : t('body')}
          </p>
          {!forced && (
            <div className="flex items-center gap-3 mt-3">
              <Link
                href={localizedSkip}
                className="text-xs underline opacity-70 hover:opacity-100"
                style={{ color: 'var(--am-muted)' }}
              >
                {t('skip')}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
