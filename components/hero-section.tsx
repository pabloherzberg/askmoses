"use client"

import { Sparkles } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useTranslations } from "next-intl"

export function HeroSection() {
  const t = useTranslations("Landing.Hero")

  return (
    <section id="overview" className="pt-32 pb-20 px-6">
      <div className="container mx-auto max-w-4xl">
        <Link
          href="https://netmidas.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 mb-8 w-fit hover:opacity-80 transition-opacity"
        >
          <span className="text-sm text-muted-foreground">{t("poweredBy")}</span>
          <Image src="/images/netlogo.png" alt="Net Results" width={32} height={32} className="h-8 w-auto" />
        </Link>

        <div className="flex items-center gap-2 text-primary mb-6">
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-medium uppercase tracking-wider">{t("badge")}</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight mb-6 text-balance">
          {t("title")}
        </h1>
        <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl">
          {t("subtitle")}
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <div className="px-4 py-2 bg-card border border-border rounded-lg">
            <span className="text-muted-foreground text-sm">{t("timelineLabel")}</span>
            <p className="text-foreground font-semibold">{t("timelineValue")}</p>
          </div>
          <div className="px-4 py-2 bg-card border border-border rounded-lg">
            <span className="text-muted-foreground text-sm">{t("teamLabel")}</span>
            <p className="text-foreground font-semibold">{t("teamValue")}</p>
          </div>
          <div className="px-4 py-2 bg-card border border-border rounded-lg">
            <span className="text-muted-foreground text-sm">{t("approachLabel")}</span>
            <p className="text-foreground font-semibold">{t("approachValue")}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
