'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { LogoSVG } from '@/components/shared/LogoSVG'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { validatePassword, PASSWORD_MIN_LENGTH } from '@/lib/auth/password'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const PLAN_LABELS: Record<string, string> = { solo: 'Solo', pro: 'Pro' }

export default function SignupPage() {
  const t = useTranslations('Signup')
  const locale = useLocale()
  const params = useSearchParams()

  const stripePlan = params.get('plan') ?? ''
  const stripeSessionId = params.get('session_id') ?? ''
  const comingFromStripe = Boolean(stripePlan && stripeSessionId)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) return setError(t('nameRequired'))
    if (!EMAIL_RE.test(email)) return setError(t('emailInvalid'))
    const pw = validatePassword(password)
    if (!pw.valid) {
      if (pw.reason === 'PASSWORD_NO_UPPERCASE') return setError(t('passwordNeedsUppercase'))
      if (pw.reason === 'PASSWORD_NO_SPECIAL') return setError(t('passwordNeedsSpecial'))
      return setError(t('passwordTooShort', { min: PASSWORD_MIN_LENGTH }))
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          locale,
          stripePlan: stripePlan || undefined,
          stripeSessionId: stripeSessionId || undefined,
        }),
      })
      const json = (await res.json()) as {
        data: { sent: boolean; mocked?: boolean } | null
        error: { message: string; code: number; reason?: string } | null
      }

      if (!res.ok || !json.data) {
        const reason = json.error?.reason
        if (reason === 'EMAIL_ALREADY_REGISTERED') setError(t('emailAlreadyRegistered'))
        else if (reason === 'EMAIL_INVALID') setError(t('emailInvalid'))
        else if (reason === 'PASSWORD_INVALID' || reason === 'PASSWORD_REJECTED') {
          setError(json.error?.message ?? t('passwordTooShort', { min: PASSWORD_MIN_LENGTH }))
        } else if (reason === 'RATE_LIMITED') {
          setError(json.error?.message ?? t('genericError'))
        } else {
          setError(t('genericError'))
        }
        return
      }

      setSubmitted(true)
    } catch {
      setError(t('genericError'))
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="w-full max-w-sm px-6 text-center">
        <LogoSVG className="h-14 w-auto mx-auto mb-8" />
        <h1 className="text-lg font-medium mb-3" style={{ color: 'var(--am-text)' }}>
          {t('verifyEmailTitle')}
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--am-muted)' }}>
          {t('verifyEmailBody', { email })}
        </p>
        <Link
          href={`/${locale}/login`}
          className="text-sm underline"
          style={{ color: 'var(--am-accent2)' }}
        >
          {t('backToLogin')}
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm px-6">
      <div className="flex items-center justify-between mb-10">
        <LogoSVG className="h-14 w-auto" />
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <Link
            href={`/${locale}`}
            aria-label={t('backToHome')}
            title={t('backToHome')}
            className="group inline-flex h-8 items-center rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-4 shrink-0" />
            <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,margin-left,opacity] duration-300 ease-out group-hover:ml-1.5 group-hover:max-w-[160px] group-hover:opacity-100 group-focus-visible:ml-1.5 group-focus-visible:max-w-[160px] group-focus-visible:opacity-100">
              {t('backToHome')}
            </span>
          </Link>
        </div>
      </div>

      {comingFromStripe && (
        <div
          className="mb-6 rounded-lg px-4 py-3 text-sm"
          style={{ background: 'rgba(110,86,255,0.1)', border: '1px solid rgba(110,86,255,0.3)', color: 'var(--am-accent2)' }}
        >
          Plano <strong>{PLAN_LABELS[stripePlan] ?? stripePlan}</strong> adquirido ✓ — crie sua conta para acessar.
        </div>
      )}

      <h1 className="text-lg font-medium mb-1" style={{ color: 'var(--am-text)' }}>
        {t('title')}
      </h1>
      <p className="text-xs mb-6" style={{ color: 'var(--am-muted)' }}>
        {t('subtitle')}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--am-muted)' }}>
            {t('nameLabel')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={{ background: 'var(--am-bg3)', border: '1px solid var(--am-border2)', color: 'var(--am-text)' }}
            placeholder={t('namePlaceholder')}
          />
        </div>

        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--am-muted)' }}>
            {t('emailLabel')}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={{ background: 'var(--am-bg3)', border: '1px solid var(--am-border2)', color: 'var(--am-text)' }}
            placeholder={t('emailPlaceholder')}
          />
        </div>

        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--am-muted)' }}>
            {t('passwordLabel')}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={{ background: 'var(--am-bg3)', border: '1px solid var(--am-border2)', color: 'var(--am-text)' }}
            placeholder={t('passwordPlaceholder')}
          />
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--am-muted)' }}>
            {t('passwordHint', { min: PASSWORD_MIN_LENGTH })}
          </p>
        </div>

        {error && (
          <p className="text-xs" style={{ color: 'var(--am-red)' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
          style={{ background: 'var(--accent)' }}
        >
          {loading ? t('submitting') : t('submit')}
        </button>
      </form>

      <p className="text-xs text-center mt-6" style={{ color: 'var(--am-muted)' }}>
        {t('haveAccount')}{' '}
        <Link href={`/${locale}/login`} className="underline" style={{ color: 'var(--am-accent2)' }}>
          {t('loginLink')}
        </Link>
      </p>
    </div>
  )
}
