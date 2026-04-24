"use client"

import {
  FileText,
  Upload,
  Bot,
  Mail,
  History,
  BarChart3,
  Webhook,
  Database,
  Brain,
  Search,
  BookOpen,
  Settings,
  Check,
  X,
  type LucideIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

type DeliveryStatus = "done" | "pending"
interface DeliverableItem {
  text: string
  status?: DeliveryStatus
  note?: string
}

const tierConfig = [
  {
    key: "starter",
    hasStatus: true,
    deliverables: [
      { key: "rubric", icon: FileText },
      { key: "upload", icon: Upload },
      { key: "analysis", icon: Bot },
      { key: "email", icon: Mail },
      { key: "history", icon: History },
      { key: "summary", icon: BarChart3 },
    ],
  },
  {
    key: "pro",
    hasStatus: false,
    deliverables: [
      { key: "twilio", icon: Webhook },
      { key: "db", icon: Database },
      { key: "admin", icon: Settings },
    ],
  },
  {
    key: "proRag",
    hasStatus: false,
    deliverables: [
      { key: "rag", icon: Brain },
      { key: "contextual", icon: Search },
      { key: "management", icon: BookOpen },
    ],
  },
] as const

export function AppendixSection() {
  const t = useTranslations("Landing.Appendix")

  return (
    <section id="appendix" className="py-24 border-t border-border">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-amber-500 font-medium mb-2">{t("label")}</p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">{t("title")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t("subtitle")}
          </p>
        </div>

        <div className="space-y-16">
          {tierConfig.map((tier, tierIndex) => {
            const tierKey = tier.key
            const tierName = t(`tiers.${tierKey}.name`)
            const tierTimeline = t(`tiers.${tierKey}.timeline`)
            const tierIncludes = tierKey === "pro" || tierKey === "proRag" ? t(`tiers.${tierKey}.includes`) : null

            return (
              <div key={tierKey} className="border border-border rounded-lg overflow-hidden">
                {/* Tier Header */}
                <div className="bg-muted/30 px-6 py-4 border-b border-border flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-amber-500 font-mono text-sm">{t("tierLabel", { n: tierIndex + 1 })}</span>
                    <h3 className="text-xl font-bold text-foreground">{tierName}</h3>
                    {tier.hasStatus && (
                      <span className="text-green-500 font-mono text-sm font-semibold">{t("deliveredStatus")}</span>
                    )}
                    {tierIncludes && (
                      <span className="text-muted-foreground text-sm hidden md:inline">— {tierIncludes}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">{tierTimeline}</span>
                  </div>
                </div>

                {tierIncludes && (
                  <div className="px-6 py-2 bg-muted/10 border-b border-border md:hidden">
                    <span className="text-muted-foreground text-sm">{tierIncludes}</span>
                  </div>
                )}

                {/* Deliverables Grid */}
                <div className="p-6">
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {tier.deliverables.map((deliverable) => {
                      const Icon: LucideIcon = deliverable.icon
                      const category = t(`tiers.${tierKey}.deliverables.${deliverable.key}.category`)
                      const items = t.raw(`tiers.${tierKey}.deliverables.${deliverable.key}.items`) as
                        | DeliverableItem[]
                        | string[]
                      return (
                        <div key={deliverable.key} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-amber-500" />
                            <h4 className="font-semibold text-foreground text-sm">{category}</h4>
                          </div>
                          <ul className="space-y-1.5">
                            {items.map((item, i) => {
                              const isObject = typeof item === "object" && item !== null
                              const text = isObject ? (item as DeliverableItem).text : (item as string)
                              const status = isObject ? (item as DeliverableItem).status : undefined
                              const note = isObject ? (item as DeliverableItem).note : undefined
                              // In current data, starter items have no explicit status, but tier has hasStatus=true
                              const effectiveStatus = tier.hasStatus && !status ? "done" : status

                              return (
                                <li key={i} className="text-sm flex items-start gap-2">
                                  {effectiveStatus ? (
                                    effectiveStatus === "done" ? (
                                      <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                    ) : (
                                      <X className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                    )
                                  ) : (
                                    <span className="text-amber-500/60 mt-1.5">•</span>
                                  )}
                                  <span className={effectiveStatus === "pending" ? "text-muted-foreground/70" : "text-muted-foreground"}>
                                    {text}
                                    {note && (
                                      <span className="text-xs text-muted-foreground/50 ml-1">({note})</span>
                                    )}
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Disclaimer */}
        <div className="mt-12 p-4 border border-border rounded-lg bg-muted/10">
          <p className="text-sm text-muted-foreground">
            <span className="text-amber-500 font-semibold">{t("disclaimer")}</span> {t("disclaimerBody")}
          </p>
        </div>
      </div>
    </section>
  )
}
