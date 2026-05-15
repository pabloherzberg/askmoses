import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"

export function CtaBand() {
  const t = useTranslations("LP.CtaBand")

  return (
    <section className="bg-brand-gradient">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 py-14 text-center sm:px-6 lg:flex-row lg:px-8 lg:py-16 lg:text-left">
        <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
          {t("title")}
        </h2>
        <a
          href="#demo"
          className="group inline-flex flex-shrink-0 items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-semibold text-[#1a6fd4] shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
        >
          {t("cta")}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </a>
      </div>
    </section>
  )
}
