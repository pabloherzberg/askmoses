"use client"

import { AlertCircle } from "lucide-react"
import { useTranslations } from "next-intl"

export function ProblemSection() {
  const t = useTranslations("Landing.Problem")
  const problems = t.raw("items") as string[]

  return (
    <section className="py-20 px-6 border-t border-border">
      <div className="container mx-auto max-w-4xl">
        <div className="flex items-center gap-2 text-primary mb-4">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm font-medium uppercase tracking-wider">{t("badge")}</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">{t("title")}</h2>
        <div className="space-y-4">
          {problems.map((problem, index) => (
            <div key={index} className="flex items-start gap-4 p-4 bg-card border border-border rounded-lg">
              <span className="text-primary font-mono text-sm">0{index + 1}</span>
              <p className="text-foreground">{problem}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
