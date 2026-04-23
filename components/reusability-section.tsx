"use client"

import { Check, FileText, Upload, Brain, Mail, BarChart3, History } from "lucide-react"
import { useTranslations } from "next-intl"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const componentKeys = ["rubric", "upload", "analysis", "email", "summary", "history"] as const
const componentIcons = [FileText, Upload, Brain, Mail, BarChart3, History]
const reusabilityValues = [95, 85, 90, 100, 90, 95]

export function ReusabilitySection() {
  const t = useTranslations("Landing.Reusability")
  const avgReusability = Math.round(
    reusabilityValues.reduce((sum, v) => sum + v, 0) / reusabilityValues.length,
  )
  const noCodeItems = t.raw("codeVsNoCode.noCodeItems") as string[]
  const codeItems = t.raw("codeVsNoCode.codeItems") as string[]

  return (
    <TooltipProvider>
      <section id="reusability" className="py-24 border-t border-border">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">{t("title")}</h2>
            <p className="text-muted-foreground text-lg">
              {t("subtitle")}
            </p>
          </div>

          {/* Main comparison table */}
          <div className="overflow-x-auto mb-16">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-4 font-semibold text-foreground">{t("th.component")}</th>
                  <th className="text-left py-4 px-4 font-semibold text-amber-500">{t("th.whatWeBuild")}</th>
                  <th className="text-left py-4 px-4 font-semibold text-muted-foreground">{t("th.phase15")}</th>
                  <th className="text-left py-4 px-4 font-semibold text-muted-foreground">{t("th.phase2")}</th>
                  <th className="text-left py-4 px-4 font-semibold text-muted-foreground">{t("th.phase3")}</th>
                  <th className="text-center py-4 px-4 font-semibold text-foreground">{t("th.reuse")}</th>
                </tr>
              </thead>
              <tbody>
                {componentKeys.map((key, index) => {
                  const Icon = componentIcons[index]
                  const reusability = reusabilityValues[index]
                  return (
                    <tr key={key} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-amber-500/10">
                            <Icon className="h-4 w-4 text-amber-500" />
                          </div>
                          <span className="font-medium">{t(`components.${key}.component`)}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-amber-500 flex-shrink-0" />
                          <span className="text-sm">{t(`components.${key}.mvp`)}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-muted-foreground text-sm">{t(`components.${key}.phase15`)}</td>
                      <td className="py-4 px-4 text-muted-foreground text-sm">{t(`components.${key}.phase2`)}</td>
                      <td className="py-4 px-4 text-muted-foreground text-sm">{t(`components.${key}.phase3`)}</td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm font-semibold text-green-500 cursor-help border-b border-dashed border-green-500/50">
                                {reusability}%
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs">
                              <p className="text-sm">{t(`components.${key}.reusabilityReason`)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Summary stats */}
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <div className="text-4xl font-bold text-amber-500 mb-2">{avgReusability}%</div>
              <div className="text-muted-foreground text-sm">{t("stats.avgReusability")}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <div className="text-4xl font-bold text-foreground mb-2">Next.js</div>
              <div className="text-muted-foreground text-sm">{t("stats.stack")}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <div className="text-4xl font-bold text-foreground mb-2">0</div>
              <div className="text-muted-foreground text-sm">{t("stats.vendorLockIn")}</div>
            </div>
          </div>

          {/* Code vs No-Code comparison */}
          <div className="mt-16 max-w-4xl mx-auto">
            <h3 className="text-xl font-semibold text-center mb-8">{t("codeVsNoCode.title")}</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="text-lg font-semibold mb-4 text-muted-foreground">{t("codeVsNoCode.noCodeTitle")}</div>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  {noCodeItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">×</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-card border border-amber-500/50 rounded-xl p-6">
                <div className="text-lg font-semibold mb-4 text-amber-500">{t("codeVsNoCode.codeTitle")}</div>
                <ul className="space-y-3 text-sm">
                  {codeItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </TooltipProvider>
  )
}
