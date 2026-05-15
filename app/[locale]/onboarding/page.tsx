'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { LogoSVG } from '@/components/shared/LogoSVG'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'

const NAME_MIN = 2
const NAME_MAX = 80

export default function OnboardingPage() {
  const t = useTranslations('Onboarding')
  const locale = useLocale()

  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const name = orgName.trim()
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      return setError(t('nameInvalid', { min: NAME_MIN, max: NAME_MAX }))
    }

    setLoading(true)
    try {
      const res = await fetch('/api/onboarding/organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = (await res.json()) as {
        data: { id: string; name: string } | null
        error: { message: string; code: number; reason?: string } | null
      }

      if (!res.ok || !json.data) {
        if (json.error?.reason === 'ALREADY_HAS_ORG') {
          setError(t('alreadyHasOrg'))
        } else {
          setError(json.error?.message ?? t('genericError'))
        }
        return
      }

      // Org criada. Avança pra step-2 (escolha de plano). Full reload pra
      // o middleware re-resolver app_metadata.role (que acabou de virar 'owner').
      window.location.href = `/${locale}/onboarding/plan`
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm px-6">
      <div className="flex items-center justify-between mb-10">
        <LogoSVG className="h-14 w-auto" />
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded-full"
          style={{ background: 'var(--am-accent2-bg, rgba(155,135,255,0.12))', color: 'var(--am-accent2)' }}
        >
          {t('stepLabel', { current: 1, total: 2 })}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
          {t('stepSubtitle')}
        </span>
      </div>

      <h1 className="text-lg font-medium mb-1" style={{ color: 'var(--am-text)' }}>
        {t('title')}
      </h1>
      <p className="text-xs mb-6" style={{ color: 'var(--am-muted)' }}>
        {t('subtitle')}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--am-muted)' }}>
            {t('orgNameLabel')}
          </label>
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
            autoFocus
            minLength={NAME_MIN}
            maxLength={NAME_MAX}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={{ background: 'var(--am-bg3)', border: '1px solid var(--am-border2)', color: 'var(--am-text)' }}
            placeholder={t('orgNamePlaceholder')}
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
    </div>
  )
}
