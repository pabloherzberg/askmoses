"use client"

import { Upload, FileText, Brain, Mail, BarChart3, History } from "lucide-react"
import { useTranslations } from "next-intl"

const stepKeys = ["upload", "transcription", "analysis", "email", "summary", "history"] as const
const stepIcons = [Upload, FileText, Brain, Mail, BarChart3, History]

export function WorkflowSection() {
  const t = useTranslations("Landing.Workflow")

  return (
    <section id="workflow" className="py-20 px-6 border-t border-border">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <span className="text-sm font-medium uppercase tracking-wider text-primary">{t("badge")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">{t("title")}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stepKeys.map((key, index) => {
            const Icon = stepIcons[index]
            return (
              <div
                key={key}
                className="relative p-6 bg-card border border-border rounded-xl group hover:border-primary/50 transition-colors"
              >
                <div className="absolute top-4 right-4 text-muted-foreground/30 font-mono text-4xl font-bold">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{t(`steps.${key}.title`)}</h3>
                <p className="text-muted-foreground text-sm">{t(`steps.${key}.description`)}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
