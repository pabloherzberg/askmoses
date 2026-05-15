import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"

export function Hero() {
  const t = useTranslations("LP.Hero")

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(0,194,224,0.12),transparent)]" />
      </div>

      {/* pt aumentado pra clear o header fixo: navbar tem ~96px (py-5 + h-14),
         hero precisa começar abaixo disso com respiro. Em lg, layout vira
         2-colunas e o pt pode encolher um pouco. */}
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-28 sm:px-6 sm:pt-32 lg:grid lg:grid-cols-12 lg:gap-12 lg:px-8 lg:pb-24 lg:pt-28">
        <div className="lg:col-span-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground/70">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-gradient" />
            {t("badge")}
          </div>

          <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {t("titlePart1")} <span className="text-brand-gradient">{t("titleHighlight")}</span>
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-lg italic leading-relaxed text-foreground/70">
            {t("subtitle")}
          </p>

          <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <a
              href="#demo"
              className="btn-brand inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#1a6fd4]/20"
            >
              {t("ctaPrimary")}
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-7 py-3.5 text-base font-semibold text-foreground hover:border-foreground/40"
            >
              {t("ctaSecondary")}
            </a>
          </div>
        </div>

        <div className="relative mt-12 lg:col-span-6 lg:mt-0">
          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute -inset-4 -z-10 rounded-3xl bg-brand-gradient opacity-20 blur-2xl"
            />
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/10 ring-1 ring-black/5">
              <Image
                src="/askmoses-dashboard.png"
                alt={t("dashboardAlt")}
                width={1600}
                height={1100}
                priority
                className="h-auto w-full"
              />
            </div>

            <div className="absolute -left-4 top-8 hidden rounded-xl border border-border bg-card px-4 py-3 shadow-lg sm:block">
              <div className="text-xs font-medium text-foreground/60">{t("statCloseRateLabel")}</div>
              <div className="text-xl font-bold text-emerald-600">{t("statCloseRateValue")}</div>
            </div>
            <div className="absolute -right-4 bottom-10 hidden rounded-xl border border-border bg-card px-4 py-3 shadow-lg sm:block">
              <div className="text-xs font-medium text-foreground/60">{t("statRevenueLabel")}</div>
              <div className="text-xl font-bold text-brand-gradient">{t("statRevenueValue")}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
