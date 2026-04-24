"use client"

import { Users, Calendar, Cpu, ArrowRight, User, Code, Brain } from "lucide-react"
import { useTranslations } from "next-intl"

export function TeamSection() {
  const t = useTranslations("Landing.Team")

  return (
    <section className="py-20 px-6 border-t border-border">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-12">
          <span className="text-sm font-medium uppercase tracking-wider text-primary">{t("badge")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">{t("title")}</h2>
        </div>

        <div className="mb-12">
          <h3 className="text-lg font-semibold text-foreground mb-6 text-center">{t("evolutionTitle")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
            {/* MVP Phase */}
            <div className="p-6 bg-primary/5 border border-primary/30 rounded-xl">
              <div className="text-xs font-medium uppercase tracking-wider text-primary mb-3">{t("mvpPhase")}</div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{t("aiBuilder")}</p>
                  <p className="text-sm text-muted-foreground">{t("aiBuilderSubtitle")}</p>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {t("aiBuilderDesc")}
              </div>
            </div>

            {/* Arrow */}
            <div className="hidden md:flex items-center justify-center">
              <ArrowRight className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex md:hidden items-center justify-center py-2">
              <ArrowRight className="h-6 w-6 text-muted-foreground rotate-90" />
            </div>

            {/* Post-MVP Phase */}
            <div className="p-6 bg-card border border-border rounded-xl">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                {t("postMvpScale")}
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                    <Code className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{t("fullStack")}</p>
                    <p className="text-sm text-muted-foreground">{t("fullStackSubtitle")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                    <Brain className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{t("seniorAiPm")}</p>
                    <p className="text-sm text-muted-foreground">{t("seniorAiPmSubtitle")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-card border border-border rounded-xl text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Calendar className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-2xl font-bold text-foreground">{t("stats.weeks")}</h3>
            <p className="text-muted-foreground text-sm mt-1">{t("stats.weeksSubtitle")}</p>
          </div>
          <div className="p-6 bg-card border border-border rounded-xl text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-2xl font-bold text-foreground">{t("stats.growth")}</h3>
            <p className="text-muted-foreground text-sm mt-1">{t("stats.growthSubtitle")}</p>
          </div>
          <div className="p-6 bg-card border border-border rounded-xl text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Cpu className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-2xl font-bold text-foreground">{t("stats.aiFirst")}</h3>
            <p className="text-muted-foreground text-sm mt-1">{t("stats.aiFirstSubtitle")}</p>
          </div>
        </div>

        <div className="mt-12 p-6 bg-card border border-primary/30 rounded-xl">
          <h3 className="text-lg font-semibold text-foreground mb-4">{t("stackTitle")}</h3>
          <div className="flex flex-wrap gap-2">
            {["Next.js", "Vercel", "Supabase", "OpenAI Whisper", "GPT-4o", "Resend", "v0"].map((tech) => (
              <span key={tech} className="px-3 py-1.5 bg-secondary text-secondary-foreground text-sm rounded-full">
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
