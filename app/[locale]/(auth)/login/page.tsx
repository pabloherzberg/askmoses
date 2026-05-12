'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Role, PlanCode } from '@/lib/types'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { LogoSVG } from '@/components/shared/LogoSVG'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { DEMO_CLIENTS } from '@/lib/demo-clients'

function redirectByRole(role: Role): string {
  return role === 'trainer' ? '/me' : role === 'owner' ? '/dashboard' : '/admin'
}

const PLAN_BADGE_STYLE: Record<PlanCode, { bg: string; color: string }> = {
  starter: { bg: 'var(--am-blue-bg)',                                  color: 'var(--am-blue)'    },
  pro:     { bg: 'var(--am-accent2-bg, rgba(155,135,255,0.12))',       color: 'var(--am-accent2)' },
  pro_rag: { bg: 'var(--am-green-bg)',                                 color: 'var(--am-green)'   },
}

export default function LoginPage() {
  const t = useTranslations('Login')
  const locale = useLocale()
  const searchParams = useSearchParams()

  const [activeClientId, setActiveClientId] = useState<string>(DEMO_CLIENTS[0].id)
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [magicLoading, setMagicLoading] = useState(false)
  const [magicNotice, setMagicNotice] = useState('')

  // Erros propagados via query param pelo callback /api/auth/verify-invite-token.
  // Hoje só `invite_expired` (cobre token expirado, consumido ou invalidado).
  useEffect(() => {
    const errParam = searchParams.get('error')
    if (errParam === 'invite_expired') {
      setError(t('inviteExpired'))
    }
  }, [searchParams, t])

  const switchMode = (next: 'password' | 'magic') => {
    setMode(next)
    setError('')
    setMagicNotice('')
  }

  const activeClient = DEMO_CLIENTS.find((c) => c.id === activeClientId) ?? DEMO_CLIENTS[0]

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const supabase = createClient()

      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError || !data.session) {
        setError(t('invalidCredentials'))
        return
      }

      const meRes = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      })
      const { data: meData } = (await meRes.json()) as {
        data: { role: string; name: string; trainerId: string | null } | null
        error: unknown
      }

      if (!meData) {
        setError(t('profileNotFound'))
        return
      }

      window.location.href = `/${locale}${redirectByRole(meData.role as Role)}`
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail)
    setPassword(demoPassword)
    setError('')
    setMagicNotice('')
    setMode('password')
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMagicNotice('')

    if (!email || !EMAIL_RE.test(email)) {
      setError(t('emailRequiredForMagic'))
      return
    }

    setMagicLoading(true)
    try {
      // Resposta é sempre genérica — não distinguimos email cadastrado x não
      await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, locale }),
      })
      setMagicNotice(t('magicLinkSent'))
    } finally {
      setMagicLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm px-6">
      {/* Logo + controls */}
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

      {/* Mode tabs */}
      <div
        className="flex gap-1 p-1 rounded-lg mb-4"
        style={{ background: 'var(--am-bg4)', border: '1px solid var(--am-border)' }}
        role="tablist"
        aria-label={t('signInMode')}
      >
        {(['password', 'magic'] as const).map((m) => {
          const isActive = mode === m
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => switchMode(m)}
              className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                background: isActive ? 'var(--am-bg2)' : 'transparent',
                color: isActive ? 'var(--am-text)' : 'var(--am-muted)',
                border: isActive ? '1px solid var(--am-border)' : '1px solid transparent',
              }}
            >
              {m === 'password' ? t('modePassword') : t('modeMagic')}
            </button>
          )
        })}
      </div>

      {/* Form */}
      <form onSubmit={mode === 'password' ? handleLogin : handleMagicLink} className="space-y-4">
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--am-muted)' }}>
            {t('emailLabel')}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={{ background: 'var(--am-bg3)', border: '1px solid var(--am-border2)', color: 'var(--am-text)' }}
            placeholder={t('emailPlaceholder')}
          />
        </div>

        {mode === 'password' && (
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--am-muted)' }}>
              {t('passwordLabel')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
              style={{ background: 'var(--am-bg3)', border: '1px solid var(--am-border2)', color: 'var(--am-text)' }}
              placeholder={t('passwordPlaceholder')}
            />
          </div>
        )}

        {mode === 'magic' && (
          <p className="text-xs" style={{ color: 'var(--am-muted)' }}>
            {t('magicLinkHint')}
          </p>
        )}

        {error && (
          <p className="text-xs" style={{ color: 'var(--am-red)' }}>{error}</p>
        )}
        {magicNotice && (
          <p className="text-xs" style={{ color: 'var(--am-green)' }}>{magicNotice}</p>
        )}

        <button
          type="submit"
          disabled={loading || magicLoading}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
          style={{ background: 'var(--accent)' }}
        >
          {mode === 'password'
            ? (loading ? t('submitting') : t('submit'))
            : (magicLoading ? t('magicLinkSubmitting') : t('magicLinkSubmit'))}
        </button>
      </form>

      <p className="text-xs text-center mt-4" style={{ color: 'var(--am-muted)' }}>
        {t('noAccount')}{' '}
        <Link href={`/${locale}/signup`} className="underline" style={{ color: 'var(--am-accent2)' }}>
          {t('signupLink')}
        </Link>
      </p>

      {/* Demo shortcuts — Client tabs + per-client users */}
      <div
        className="mt-8 mb-8 p-4 rounded-xl border"
        style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)' }}
      >
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-[11px] font-medium tracking-widest uppercase" style={{ color: 'var(--am-muted)' }}>
            {t('demoAccess')}
          </p>
          <p className="text-[10px]" style={{ color: 'var(--am-muted)' }}>
            {t('demoAccountSubtitle')}
          </p>
        </div>

        {/* Client tabs */}
        <div
          className="flex gap-1 p-1 rounded-lg mb-3"
          style={{ background: 'var(--am-bg4)', border: '1px solid var(--am-border)' }}
          role="tablist"
          aria-label={t('demoAccess')}
        >
          {DEMO_CLIENTS.map((client) => {
            const isActive = client.id === activeClientId
            const badge = PLAN_BADGE_STYLE[client.planCode]
            return (
              <button
                key={client.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveClientId(client.id)}
                className="flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors flex flex-col items-center gap-1"
                style={{
                  background: isActive ? 'var(--am-bg2)' : 'transparent',
                  color: isActive ? 'var(--am-text)' : 'var(--am-muted)',
                  border: isActive ? '1px solid var(--am-border)' : '1px solid transparent',
                }}
              >
                <span className="leading-tight text-center">{client.name}</span>
                <span
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                  style={{ background: badge.bg, color: badge.color }}
                >
                  {client.planName}
                </span>
              </button>
            )
          })}
        </div>

        {/* Active client users */}
        <div className="flex flex-col gap-2">
          {activeClient.users.map((u) => (
            <button
              key={u.email}
              type="button"
              onClick={() => fillDemo(u.email, u.password)}
              className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-left transition-colors"
              style={{ background: 'var(--am-bg4)', border: '1px solid var(--am-border)', color: 'var(--am-text)' }}
            >
              <span className="text-xs font-medium">{u.roleLabel}</span>
              <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>{u.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
