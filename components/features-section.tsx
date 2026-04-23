"use client"

import { Settings, Upload, Brain, Mail, PieChart, Clock } from "lucide-react"
import { useTranslations } from "next-intl"

const featureKeys = ["rubricManager", "manualUpload", "aiAnalysis", "coachingEmail", "aggregateSummary", "history"] as const
const featureIcons = [Settings, Upload, Brain, Mail, PieChart, Clock]

export function FeaturesSection() {
  const t = useTranslations("Landing.Features")

  return (
    <section id="features" className="py-20 px-6 border-t border-border">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <span className="text-sm font-medium uppercase tracking-wider text-primary">{t("badge")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">{t("title")}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {featureKeys.map((key, index) => {
            const Icon = featureIcons[index]
            const details = t.raw(`items.${key}.details`) as string[]
            return (
              <div
                key={key}
                className="p-6 bg-card border border-border rounded-xl hover:border-primary/50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-foreground mb-2">{t(`items.${key}.title`)}</h3>
                    <p className="text-muted-foreground text-sm mb-4">{t(`items.${key}.description`)}</p>
                    <ul className="grid grid-cols-2 gap-2">
                      {details.map((detail, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                          <span className="h-1 w-1 bg-primary rounded-full" />
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
