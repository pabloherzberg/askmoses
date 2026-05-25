'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { LogoSVG } from '@/components/shared/LogoSVG'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ForgotPasswordForm() {
  const t = useTranslations('ForgotPassword')
  const tLogin = useTranslations('Login')
  const locale = useLocale()

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')

    if (!email || !EMAIL_RE.test(email)) {
      setError(t('emailInvalid'))
      return
    }

    setSubmitting(true)
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), locale }),
      })
      // Resposta sempre 200 — anti-enumeration. Notice é genérica.
      setNotice(t('sent'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-sm px-6">
      <div className="flex items-center justify-between mb-10">
        <LogoSVG className="h-14 w-auto" />
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <Link
            href={`/${locale}/login`}
            aria-label={tLogin('backToHome')}
            title={t('backToLogin')}
            className="group inline-flex h-8 items-center rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-4 shrink-0" />
            <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,margin-left,opacity] duration-300 ease-out group-hover:ml-1.5 group-hover:max-w-[160px] group-hover:opacity-100 group-focus-visible:ml-1.5 group-focus-visible:max-w-[160px] group-focus-visible:opacity-100">
              {t('backToLogin')}
            </span>
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {t('title')}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--am-muted)' }}>
          {t('subtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--am-muted)' }}>
            {t('emailLabel')}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={submitting}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={{ background: 'var(--am-bg3)', border: '1px solid var(--am-border2)', color: 'var(--am-text)' }}
            placeholder={t('emailPlaceholder')}
          />
        </div>

        {error && (
          <p className="text-xs" style={{ color: 'var(--am-red)' }}>{error}</p>
        )}
        {notice && (
          <p className="text-xs" style={{ color: 'var(--am-green)' }}>{notice}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
          style={{ background: 'var(--accent)' }}
        >
          {submitting ? t('submitting') : t('submit')}
        </button>
      </form>

      <p className="text-xs text-center mt-4" style={{ color: 'var(--am-muted)' }}>
        <Link href={`/${locale}/login`} className="underline" style={{ color: 'var(--am-accent2)' }}>
          {t('backToLogin')}
        </Link>
      </p>
    </div>
  )
}
