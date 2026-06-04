'use client'

import { useState } from 'react'
import { User, Rocket, Building2, Check, Sparkles, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

const planConfigs = [
  { id: "solo", icon: User, popular: false, highlightFirst: false, hasCustomNote: false, checkoutPlan: "solo" },
  { id: "pro", icon: Rocket, popular: true, highlightFirst: true, hasCustomNote: false, checkoutPlan: "pro" },
  { id: "enterprise", icon: Building2, popular: false, highlightFirst: false, hasCustomNote: true, checkoutPlan: null },
] as const

export function Pricing() {
  const t = useTranslations("LP.Pricing")
  const [loading, setLoading] = useState<string | null>(null)

  async function handleCheckout(plan: string) {
    setLoading(plan)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const json = await res.json()
      if (json.data?.url) {
        window.location.href = json.data.url
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <section id="pricing" className="border-y border-border bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-foreground/50">{t("eyebrow")}</p>
          <h2 className="mt-4 text-balance text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {t("title")}
          </h2>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {planConfigs.map((plan) => {
            const Icon = plan.icon
            const isPopular = plan.popular
            const features = t.raw(`plans.${plan.id}.features`) as string[]
            const isLoading = loading === plan.checkoutPlan
            return (
              <div
                key={plan.id}
                className={cn(
                  "relative rounded-2xl",
                  isPopular ? "border-brand-gradient p-px shadow-xl shadow-[#1a6fd4]/10" : "",
                )}
              >
                <div
                  className={cn(
                    "relative flex h-full flex-col rounded-2xl bg-card p-7 sm:p-8",
                    isPopular ? "rounded-[14px]" : "border border-border",
                  )}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-gradient px-3 py-1 text-xs font-semibold text-white shadow-md">
                        <Sparkles className="h-3 w-3" />
                        {t("popularBadge")}
                      </span>
                    </div>
                  )}

                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/5 text-foreground/70">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>

                  <h3 className="mt-5 text-2xl font-bold text-foreground">{t(`plans.${plan.id}.name`)}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-foreground/60">{t(`plans.${plan.id}.description`)}</p>

                  <div className="mt-7">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-foreground sm:text-5xl">{t(`plans.${plan.id}.price`)}</span>
                      {!plan.hasCustomNote && (
                        <span className="text-base font-medium text-foreground/60">{t(`plans.${plan.id}.priceSuffix`)}</span>
                      )}
                    </div>
                    {!plan.hasCustomNote && (
                      <div className="mt-3 inline-block rounded-md bg-muted/60 px-3 py-2 text-sm text-foreground/70 ring-1 ring-border">
                        {t(`plans.${plan.id}.priceNote`)}
                      </div>
                    )}
                    {plan.hasCustomNote && (
                      <div className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-sm text-foreground/70 ring-1 ring-border">
                        {t(`plans.${plan.id}.customNote`)}
                      </div>
                    )}
                  </div>

                  <div className="my-7 h-px w-full bg-border" />

                  <ul className="space-y-3">
                    {features.map((feature, idx) => {
                      const isFirstHighlight = plan.highlightFirst && idx <= 1
                      return (
                        <li key={feature} className="flex items-start gap-3">
                          {isFirstHighlight ? (
                            <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#1a6fd4]" aria-hidden="true" />
                          ) : (
                            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-foreground/60" aria-hidden="true" />
                          )}
                          <span
                            className={cn(
                              "text-sm leading-relaxed",
                              isFirstHighlight ? "font-semibold text-foreground" : "text-foreground/80",
                            )}
                          >
                            {feature}
                          </span>
                        </li>
                      )
                    })}
                  </ul>

                  {plan.checkoutPlan ? (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleCheckout(plan.checkoutPlan!)}
                      className={cn(
                        "mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-all disabled:opacity-70",
                        isPopular
                          ? "btn-brand text-white"
                          : "border border-border bg-card text-foreground hover:border-foreground/40",
                      )}
                    >
                      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {isLoading ? "Redirecionando..." : t(`plans.${plan.id}.cta`)}
                    </button>
                  ) : (
                    <a
                      href="#demo"
                      className={cn(
                        "mt-8 inline-flex w-full items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition-all",
                        "border border-border bg-card text-foreground hover:border-foreground/40",
                      )}
                    >
                      {t(`plans.${plan.id}.cta`)}
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-10 text-center text-sm italic text-foreground/55">
          {t("footnote")}
        </p>
      </div>
    </section>
  )
}
