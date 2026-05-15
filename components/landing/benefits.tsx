import { Database, ClipboardCheck, TrendingUp, Sparkles, ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"

const benefitKeys = [
  { id: "data", icon: Database },
  { id: "rubric", icon: ClipboardCheck },
  { id: "sellMore", icon: TrendingUp },
] as const

export function Benefits() {
  const t = useTranslations("LP.Benefits")
  const bullets = t.raw("differentiator.bullets") as string[]

  return (
    <section id="benefits" className="border-y border-border bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-foreground/50">{t("eyebrow")}</p>
          <h2 className="mt-4 text-balance text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {t("title")}
          </h2>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <div className="border-brand-gradient relative overflow-hidden rounded-2xl p-px lg:row-span-2">
            <div className="relative flex h-full flex-col justify-between rounded-[14px] bg-card p-8 lg:p-10">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("differentiator.badge")}
                </div>
                <h3 className="mt-6 text-2xl font-bold leading-tight text-foreground sm:text-3xl">
                  {t("differentiator.titlePart1")} <span className="text-brand-gradient">{t("differentiator.titleHighlight")}</span>
                </h3>
                <p className="mt-5 text-pretty text-base leading-relaxed text-foreground/70">
                  {t("differentiator.body")}
                </p>
                <ul className="mt-6 space-y-3">
                  {bullets.map((line) => (
                    <li key={line} className="flex items-center gap-3 text-base font-medium text-foreground">
                      <span className="inline-block h-2 w-2 rounded-full bg-brand-gradient" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>

              <a
                href="#demo"
                className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-[#1a6fd4] hover:text-[#00c2e0]"
              >
                {t("differentiator.cta")}
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-1">
            {benefitKeys.map((b) => {
              const Icon = b.icon
              return (
                <div
                  key={b.id}
                  className="group rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lg sm:p-7"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#1a6fd4]/5 text-[#1a6fd4] ring-1 ring-[#1a6fd4]/10">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">{t(`items.${b.id}.title`)}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-foreground/70">{t(`items.${b.id}.description`)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
