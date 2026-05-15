import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"

export function Problem() {
  const t = useTranslations("LP.Problem")

  return (
    <section className="border-y border-border bg-muted/40">
      <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-foreground/50">{t("eyebrow")}</p>
        <h2 className="mt-4 text-balance text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          {t("title")}
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-foreground/70">
          {t("body")}
        </p>

        <div className="mt-10">
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 text-base font-semibold text-[#1a6fd4] hover:text-[#00c2e0]"
          >
            {t("cta")}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  )
}
