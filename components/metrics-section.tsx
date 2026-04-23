"use client"

import { Activity, Heart, Star, TrendingUp } from "lucide-react"
import { useTranslations } from "next-intl"

const metricKeys = ["usage", "value", "quality", "business"] as const
const metricIcons = [Activity, Heart, Star, TrendingUp]

export function MetricsSection() {
  const t = useTranslations("Landing.Metrics")

  return (
    <section id="metrics" className="py-20 px-6 border-t border-border">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <span className="text-sm font-medium uppercase tracking-wider text-primary">{t("badge")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">{t("title")}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {metricKeys.map((key, index) => {
            const Icon = metricIcons[index]
            const items = t.raw(`items.${key}.items`) as string[]
            return (
              <div key={key} className="p-6 bg-card border border-border rounded-xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <span className="text-xs text-primary uppercase tracking-wider">{t(`items.${key}.category`)}</span>
                    <h3 className="text-lg font-semibold text-foreground">{t(`items.${key}.title`)}</h3>
                  </div>
                </div>
                <ul className="space-y-2">
                  {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="h-1.5 w-1.5 bg-primary rounded-full mt-1.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
