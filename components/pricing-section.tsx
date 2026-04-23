"use client"

import { Check, Upload, Phone, Brain, ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"

const tierKeys = ["starter", "pro", "proRag"] as const
const tierIcons = [Upload, Phone, Brain]
const tierHighlight = [false, true, false]
const ragRowKeys = ["audio", "embedding", "total"] as const
const perCallRowKeys = ["premium", "recommended", "budget", "ultraBudget"] as const

export function PricingSection() {
  const t = useTranslations("Landing.Pricing")

  return (
    <section id="pricing" className="py-20 px-6 border-t border-border">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <span className="text-sm font-medium uppercase tracking-wider text-primary">{t("badge")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">{t("title")}</h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tierKeys.map((key, index) => {
            const Icon = tierIcons[index]
            const highlight = tierHighlight[index]
            const features = t.raw(`tiers.${key}.features`) as string[]
            const notIncluded = t.raw(`tiers.${key}.notIncluded`) as string[]
            return (
              <div
                key={key}
                className={`relative p-6 rounded-xl border ${
                  highlight ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card"
                }`}
              >
                {highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                    {t("recommended")}
                  </div>
                )}

                <div className="mb-4">
                  <div
                    className={`h-10 w-10 rounded-lg flex items-center justify-center mb-4 ${
                      highlight ? "bg-primary/20" : "bg-secondary"
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${highlight ? "text-primary" : "text-secondary-foreground"}`} />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">{t(`tiers.${key}.name`)}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{t(`tiers.${key}.description`)}</p>
                </div>

                <div className="mb-6">
                  <span className="text-4xl font-bold text-foreground">{t(`tiers.${key}.price`)}</span>
                  <span className="text-muted-foreground ml-2">/ {t(`tiers.${key}.timeline`)}</span>
                </div>

                <div className="space-y-3 mb-6">
                  {features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-foreground">{feature}</span>
                    </div>
                  ))}
                </div>

                {notIncluded.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">{t("notIncluded")}</p>
                    <div className="space-y-1">
                      {notIncluded.map((item) => (
                        <div key={item} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">— {item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Upgrade Path */}
        <div className="mt-12 p-6 bg-card border border-border rounded-xl">
          <h3 className="text-lg font-semibold text-foreground mb-4">{t("upgrade.title")}</h3>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-sm">
            <div className="px-4 py-2 bg-secondary rounded-lg text-secondary-foreground">{t("upgrade.starter")}</div>
            <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90 md:rotate-0" />
            <div className="px-4 py-2 bg-primary/10 border border-primary/30 rounded-lg text-foreground">
              {t("upgrade.proPlus")}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90 md:rotate-0" />
            <div className="px-4 py-2 bg-secondary rounded-lg text-secondary-foreground">{t("upgrade.ragPlus")}</div>
          </div>
          <p className="text-center text-muted-foreground text-sm mt-4">
            {t("upgrade.note")}
          </p>
        </div>

        {/* Ongoing Costs */}
        <div className="mt-8 p-6 bg-card border border-border rounded-xl">
          <h3 className="text-lg font-semibold text-foreground mb-4">{t("ongoing.title")}</h3>

          <div className="mb-6">
            <p className="font-medium text-foreground mb-3">{t("ongoing.perCallTitle")}</p>
            <p className="text-xs text-muted-foreground mb-3">
              {t("ongoing.perCallNote")}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium">{t("ongoing.th.stack")}</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">{t("ongoing.th.transcription")}</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">{t("ongoing.th.analysis")}</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">{t("ongoing.th.costCall")}</th>
                  </tr>
                </thead>
                <tbody>
                  {perCallRowKeys.map((rkey, i) => (
                    <tr
                      key={rkey}
                      className={
                        i === perCallRowKeys.length - 1
                          ? ""
                          : rkey === "recommended"
                          ? "border-b border-border/50 bg-primary/5"
                          : "border-b border-border/50"
                      }
                    >
                      <td className="py-2 text-foreground">{t(`ongoing.rows.${rkey}.stack`)}</td>
                      <td className="py-2 text-muted-foreground">{t(`ongoing.rows.${rkey}.transcription`)}</td>
                      <td className="py-2 text-muted-foreground">{t(`ongoing.rows.${rkey}.analysis`)}</td>
                      <td className="py-2 text-right text-foreground font-medium">{t(`ongoing.rows.${rkey}.cost`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t("ongoing.perCallFootnote")}
            </p>
          </div>

          {/* RAG Knowledge Base Costs */}
          <div className="mb-6 p-4 bg-secondary/30 rounded-lg border border-border">
            <p className="font-medium text-foreground mb-3">{t("ongoing.ragTitle")}</p>
            <p className="text-xs text-muted-foreground mb-3">{t("ongoing.ragNote")}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium">{t("ongoing.ragTh.operation")}</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">{t("ongoing.ragTh.model")}</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">{t("ongoing.ragTh.cost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ragRowKeys.map((rkey) => (
                    <tr
                      key={rkey}
                      className={rkey === "total" ? "border-b border-border/50 bg-primary/5" : "border-b border-border/50"}
                    >
                      <td className={`py-2 text-foreground${rkey === "total" ? " font-medium" : ""}`}>{t(`ongoing.ragRows.${rkey}.operation`)}</td>
                      <td className="py-2 text-muted-foreground">{t(`ongoing.ragRows.${rkey}.model`)}</td>
                      <td className="py-2 text-right text-foreground font-medium">{t(`ongoing.ragRows.${rkey}.cost`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-card rounded-lg">
                <p className="text-sm text-muted-foreground">{t("ongoing.index50")}</p>
                <p className="text-lg font-bold text-foreground">{t("ongoing.index50Value")}</p>
              </div>
              <div className="p-3 bg-card rounded-lg">
                <p className="text-sm text-muted-foreground">{t("ongoing.index100")}</p>
                <p className="text-lg font-bold text-foreground">{t("ongoing.index100Value")}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {t("ongoing.ragFootnote")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-4 bg-secondary/50 rounded-lg">
              <p className="font-medium text-foreground">{t("ongoing.perCall")}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{t("ongoing.perCallValue")}</p>
              <p className="text-muted-foreground text-xs mt-1">{t("ongoing.perCallSubtitle")}</p>
            </div>
            <div className="p-4 bg-secondary/50 rounded-lg">
              <p className="font-medium text-foreground">{t("ongoing.hosting")}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{t("ongoing.hostingValue")}</p>
              <p className="text-muted-foreground text-xs mt-1">{t("ongoing.hostingSubtitle")}</p>
            </div>
            <div className="p-4 bg-secondary/50 rounded-lg">
              <p className="font-medium text-foreground">{t("ongoing.perDay")}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{t("ongoing.perDayValue")}</p>
              <p className="text-muted-foreground text-xs mt-1">{t("ongoing.perDaySubtitle")}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
