'use client'

import { useState, useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Check, Loader2 } from 'lucide-react'
import { LogoSVG } from '@/components/shared/LogoSVG'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import type { PlanCode } from '@/lib/auth'
import type { PlanOption } from './page'

interface PlanPickerProps {
  plans: PlanOption[]
  stripePlan?: string
  stripeSessionId?: string
}

function formatPrice(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

const RECOMMENDED: PlanCode = 'pro'

export function PlanPicker({ plans, stripePlan, stripeSessionId }: PlanPickerProps) {
  const t = useTranslations('OnboardingPlan')
  const locale = useLocale()

  const [selected, setSelected] = useState<PlanCode | null>(null)
  const [submitting, setSubmitting] = useState<PlanCode | null>(null)
  const [error, setError] = useState('')
  // Quando vem do Stripe, auto-ativa assim que o componente monta.
  const [autoActivating, setAutoActivating] = useState(Boolean(stripePlan && stripeSessionId))

  const activatePlan = async (planCode: PlanCode) => {
    setSelected(planCode)
    setSubmitting(planCode)
    setError('')
    try {
      const res = await fetch('/api/onboarding/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode }),
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
        setAutoActivating(false)
        return
      }

      if (json.data.checkoutUrl) {
        window.location.href = json.data.checkoutUrl
        return
      }

      window.location.href = `/${locale}/dashboard`
    } catch {
      setError(t('genericError'))
      setAutoActivating(false)
    } finally {
      setSubmitting(null)
    }
  }

  // Auto-ativa quando vier de checkout Stripe:
  // 1. Verifica a session_id na API do Stripe pra confirmar pagamento e obter planCode
  // 2. Ativa o planCode no banco via /api/onboarding/subscribe
  useEffect(() => {
    if (!stripePlan || !stripeSessionId) return

    async function autoActivate() {
      try {
        const res = await fetch(
          `/api/checkout/verify?session_id=${encodeURIComponent(stripeSessionId!)}`,
        )
        const json = (await res.json()) as {
          data: { planCode: string } | null
          error: { message: string } | null
        }

        if (!res.ok || !json.data?.planCode) {
          // Verificação falhou — exibe o seletor normal
          setError(json.error?.message ?? 'Não foi possível verificar o pagamento.')
          setAutoActivating(false)
          return
        }

        await activatePlan(json.data.planCode as PlanCode)
      } catch {
        setError('Não foi possível verificar o pagamento. Selecione seu plano abaixo.')
        setAutoActivating(false)
      }
    }

    autoActivate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (plans.length === 0) {
    return (
      <div className="w-full max-w-md px-6 text-center">
        <LogoSVG className="h-14 w-auto mx-auto mb-8" />
        <p className="text-sm" style={{ color: 'var(--am-red)' }}>{t('noPlansError')}</p>
      </div>
    )
  }

  // Tela de ativação automática (vindo do Stripe)
  if (autoActivating) {
    return (
      <div className="w-full max-w-md px-6 text-center">
        <LogoSVG className="h-14 w-auto mx-auto mb-8" />
        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin" style={{ color: 'var(--am-accent)' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--am-text)' }}>
          Ativando seu plano...
        </p>
        <p className="text-xs mt-2" style={{ color: 'var(--am-muted)' }}>
          Confirmando pagamento com o Stripe
        </p>
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
                onClick={() => activatePlan(plan.code)}
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
