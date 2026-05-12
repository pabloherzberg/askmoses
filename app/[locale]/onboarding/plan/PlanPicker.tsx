'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { LogoSVG } from '@/components/shared/LogoSVG'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import type { PlanCode } from '@/lib/auth'
import type { PlanOption } from './page'

interface PlanPickerProps {
  plans: PlanOption[]
}

function formatPrice(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

// Plano destaque visual — Pro é o "popular" no UX padrão SaaS.
const RECOMMENDED: PlanCode = 'pro'

export function PlanPicker({ plans }: PlanPickerProps) {
  const t = useTranslations('OnboardingPlan')
  const locale = useLocale()

  const [selected, setSelected] = useState<PlanCode | null>(null)
  const [submitting, setSubmitting] = useState<PlanCode | null>(null)
  const [error, setError] = useState('')

  const handleSelect = async (code: PlanCode) => {
    setSelected(code)
    setSubmitting(code)
    setError('')
    try {
      const res = await fetch('/api/onboarding/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode: code }),
      })
      const json = (await res.json()) as {
        data: { success: boolean; checkoutUrl: string | null } | null
        error: { message: string; code: number; reason?: string } | null
      }

      if (!res.ok || !json.data) {
        if (json.error?.reason === 'ALREADY_ACTIVE') {
          window.location.href = `/${locale}/dashboard`
          return
        }
        setError(json.error?.message ?? t('genericError'))
        return
      }

      // Contrato forward-compatible com Stripe: se vier checkoutUrl, redirect
      // pra checkout externo. Stub atual sempre retorna null e ativa direto.
      if (json.data.checkoutUrl) {
        window.location.href = json.data.checkoutUrl
        return
      }

      // Full reload pra middleware re-resolver subscriptionStatus='active'.
      window.location.href = `/${locale}/dashboard`
    } catch {
      setError(t('genericError'))
    } finally {
      setSubmitting(null)
    }
  }

  if (plans.length === 0) {
    return (
      <div className="w-full max-w-md px-6 text-center">
        <LogoSVG className="h-14 w-auto mx-auto mb-8" />
        <p className="text-sm" style={{ color: 'var(--am-red)' }}>{t('noPlansError')}</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between mb-10">
        <LogoSVG className="h-14 w-auto" />
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded-full"
          style={{ background: 'var(--am-accent2-bg, rgba(155,135,255,0.12))', color: 'var(--am-accent2)' }}
        >
          {t('stepLabel', { current: 2, total: 2 })}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
          {t('stepSubtitle')}
        </span>
      </div>

      <h1 className="text-2xl font-medium mb-2" style={{ color: 'var(--am-text)' }}>
        {t('title')}
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--am-muted)' }}>
        {t('subtitle')}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isRecommended = plan.code === RECOMMENDED
          const isSelected = selected === plan.code
          const isLoading = submitting === plan.code
          return (
            <div
              key={plan.code}
              className="relative rounded-xl p-6 transition-colors flex flex-col"
              style={{
                background: 'var(--am-bg2)',
                border: `1px solid ${isSelected ? 'var(--am-accent2)' : 'var(--am-border)'}`,
              }}
            >
              {isRecommended && (
                <span
                  className="absolute -top-2.5 left-6 text-[10px] font-mono px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--am-accent)', color: '#fff' }}
                >
                  {t('recommendedBadge')}
                </span>
              )}

              <h3 className="text-lg font-medium mb-1" style={{ color: 'var(--am-text)' }}>
                {plan.name}
              </h3>

              <div className="mb-4">
                <span className="text-3xl font-mono font-semibold" style={{ color: 'var(--am-text)' }}>
                  {formatPrice(plan.priceCents, locale)}
                </span>
                <span className="text-xs ml-1" style={{ color: 'var(--am-muted)' }}>
                  {t('perMonth')}
                </span>
              </div>

              {plan.maxSalesPeople !== null ? (
                <p className="text-xs mb-4" style={{ color: 'var(--am-muted)' }}>
                  {t('seatsLimit', { count: plan.maxSalesPeople })}
                </p>
              ) : (
                <p className="text-xs mb-4" style={{ color: 'var(--am-muted)' }}>
                  {t('seatsUnlimited')}
                </p>
              )}

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((feature, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs"
                    style={{ color: 'var(--am-text)' }}
                  >
                    <Check className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--am-green)' }} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={isLoading || submitting !== null}
                onClick={() => handleSelect(plan.code)}
                className="w-full py-2.5 rounded-lg text-sm font-medium transition-opacity cursor-pointer hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:opacity-60"
                style={{
                  background: isRecommended ? 'var(--accent)' : 'var(--am-bg3)',
                  color: isRecommended ? '#fff' : 'var(--am-text)',
                  border: isRecommended ? 'none' : '1px solid var(--am-border)',
                }}
              >
                {isLoading ? t('subscribing') : t('selectPlan')}
              </button>
            </div>
          )
        })}
      </div>

      {error && (
        <p className="text-xs text-center mt-6" style={{ color: 'var(--am-red)' }}>
          {error}
        </p>
      )}

      <p className="text-[11px] text-center mt-8" style={{ color: 'var(--am-muted)' }}>
        {t('stubNotice')}
      </p>
    </div>
  )
}
