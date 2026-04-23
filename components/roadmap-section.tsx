"use client"

import { Link2, Rocket, Zap, Building2 } from "lucide-react"
import { useTranslations } from "next-intl"

const phaseKeys = ["crm", "coaching", "realtime", "platform"] as const
const phaseIcons = [Link2, Rocket, Zap, Building2]

export function RoadmapSection() {
  const t = useTranslations("Landing.Roadmap")

  return (
    <section id="roadmap" className="py-20 px-6 border-t border-border">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <span className="text-sm font-medium uppercase tracking-wider text-primary">{t("badge")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">{t("title")}</h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            {t("subtitle")}
          </p>
        </div>

        <div className="mb-12 p-6 bg-card border border-border rounded-xl">
          <h3 className="text-lg font-semibold text-foreground mb-4">{t("mvpTimelineTitle")}</h3>
          <div className="flex flex-col md:flex-row items-stretch gap-4">
            <div className="flex-1 p-4 bg-secondary/50 rounded-lg border-l-4 border-primary/30">
              <span className="text-xs text-primary uppercase tracking-wider">{t("week12")}</span>
              <p className="font-medium text-foreground mt-1">{t("week12Name")}</p>
              <p className="text-sm text-muted-foreground">{t("week12Desc")}</p>
            </div>
            <div className="flex-1 p-4 bg-primary/10 rounded-lg border-l-4 border-primary">
              <span className="text-xs text-primary uppercase tracking-wider">{t("week3")}</span>
              <p className="font-medium text-foreground mt-1">{t("week3Name")}</p>
              <p className="text-sm text-muted-foreground">{t("week3Desc")}</p>
            </div>
            <div className="flex-1 p-4 bg-secondary/50 rounded-lg border-l-4 border-primary/30">
              <span className="text-xs text-primary uppercase tracking-wider">{t("week4")}</span>
              <p className="font-medium text-foreground mt-1">{t("week4Name")}</p>
              <p className="text-sm text-muted-foreground">{t("week4Desc")}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {phaseKeys.map((key, index) => {
            const Icon = phaseIcons[index]
            const items = t.raw(`phases.${key}.items`) as string[]
            return (
              <div key={key} className="p-6 bg-card border border-border rounded-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-xs text-muted-foreground px-2 py-1 bg-secondary rounded-full">
                      {t(`phases.${key}.timeline`)}
                    </span>
                  </div>
                  <span className="text-xs text-primary uppercase tracking-wider">{t(`phases.${key}.phase`)}</span>
                  <h3 className="text-lg font-semibold text-foreground mb-4">{t(`phases.${key}.title`)}</h3>
                  <ul className="space-y-2">
                    {items.map((item, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                        <span className="h-1.5 w-1.5 bg-primary/50 rounded-full mt-1.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
