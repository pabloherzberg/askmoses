"use client"

import { XCircle } from "lucide-react"
import { useTranslations } from "next-intl"

const groupKeys = ["crm", "realtime", "platform", "analytics"] as const

export function OutOfScopeSection() {
  const t = useTranslations("Landing.OutOfScope")

  return (
    <section className="py-20 px-6 border-t border-border bg-card/50">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t("badge")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">{t("title")}</h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            {t("subtitle")}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {groupKeys.map((key) => {
            const items = t.raw(`groups.${key}.items`) as string[]
            return (
              <div key={key} className="p-6 bg-background border border-border rounded-xl">
                <h3 className="text-lg font-semibold text-foreground mb-4">{t(`groups.${key}.category`)}</h3>
                <ul className="space-y-3">
                  {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <XCircle className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
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
