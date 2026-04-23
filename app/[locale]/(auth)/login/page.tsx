'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Role } from '@/lib/types'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { LogoSVG } from '@/components/shared/LogoSVG'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'

function redirectByRole(role: Role): string {
  return role === 'trainer' ? '/me' : role === 'owner' ? '/dashboard' : '/admin'
}

export default function LoginPage() {
  const t = useTranslations('Login')
  const locale = useLocale()

  const DEMO_USERS = [
    { label: t('roleSalesPerson'),             email: 'trainer@demo.askmoses.ai',  password: 'demo123', hint: 'Marcus R.' },
    { label: t('roleSalesPersonN', { n: 2 }),  email: 'trainer2@demo.askmoses.ai', password: 'demo123', hint: 'Jamie L.' },
    { label: t('roleSalesPersonN', { n: 3 }),  email: 'trainer3@demo.askmoses.ai', password: 'demo123', hint: 'Jordan K.' },
    { label: t('roleSalesPersonN', { n: 4 }),  email: 'trainer4@demo.askmoses.ai', password: 'demo123', hint: 'Taylor M.' },
    { label: t('roleManager'),                 email: 'owner@demo.askmoses.ai',    password: 'demo123', hint: 'Owner' },
    { label: t('roleAdmin'),                   email: 'admin@askmoses.ai',         password: 'demo123', hint: 'AskMoses Team' },
  ]

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
      const { data: meData } = await meRes.json() as { data: { role: string; name: string; trainerId: string | null } | null; error: unknown }

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

      {/* Form */}
      <form onSubmit={handleLogin} className="space-y-4">
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

      {/* Demo shortcuts */}
      <div
        className="mt-8 mb-8 p-4 rounded-xl border"
        style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)' }}
      >
        <p className="text-[11px] font-medium tracking-widest uppercase mb-3" style={{ color: 'var(--am-muted)' }}>
          {t('demoAccess')}
        </p>
        <div className="flex flex-col gap-2">
          {DEMO_USERS.map((u) => (
            <button
              key={u.email}
              type="button"
              onClick={() => fillDemo(u.email, u.password)}
              className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-left transition-colors"
              style={{ background: 'var(--am-bg4)', border: '1px solid var(--am-border)', color: 'var(--am-text)' }}
            >
              <span className="text-xs font-medium">{u.label}</span>
              <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>{u.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
