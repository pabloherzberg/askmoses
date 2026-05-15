import { Headphones, Search, BarChart3, Rocket } from "lucide-react"
import { useTranslations } from "next-intl"

const stepKeys = [
  { id: "listen", icon: Headphones },
  { id: "identify", icon: Search },
  { id: "evaluate", icon: BarChart3 },
  { id: "scale", icon: Rocket },
] as const

export function HowItWorks() {
  const t = useTranslations("LP.HowItWorks")

  return (
    <section id="how-it-works" className="relative">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-foreground/50">{t("eyebrow")}</p>
          <h2 className="mt-4 text-balance text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {t("title")}
          </h2>
          <p className="mt-5 text-pretty text-lg italic leading-relaxed text-foreground/60">
            {t("subtitle")}
          </p>
        </div>

        <ol className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {stepKeys.map((step, idx) => {
            const Icon = step.icon
            return (
              <li
                key={step.id}
                className="group relative rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-[#00c2e0]/40 hover:shadow-xl hover:shadow-black/5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-white">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <span className="text-sm font-semibold text-foreground/30">0{idx + 1}</span>
                </div>
                <h3 className="mt-5 text-xl font-bold text-foreground">{t(`steps.${step.id}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/70">{t(`steps.${step.id}.description`)}</p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
