import { useTranslations } from "next-intl"
import { LogoSVG } from "@/components/shared/LogoSVG"

export function Footer() {
  const t = useTranslations("LP.Footer")

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          <LogoSVG className="h-16 sm:h-20" alt={t("logoAlt")} />

          <nav className="flex flex-wrap items-center gap-x-8 gap-y-3" aria-label={t("navAriaLabel")}>
            <a href="#how-it-works" className="text-sm font-medium text-foreground/70 hover:text-foreground">
              {t("howItWorks")}
            </a>
            <a href="#benefits" className="text-sm font-medium text-foreground/70 hover:text-foreground">
              {t("benefits")}
            </a>
            <a href="#pricing" className="text-sm font-medium text-foreground/70 hover:text-foreground">
              {t("pricing")}
            </a>
            <a href="#demo" className="text-sm font-medium text-foreground/70 hover:text-foreground">
              {t("demo")}
            </a>
            <a href="mailto:hello@askmoses.ai" className="text-sm font-medium text-foreground/70 hover:text-foreground">
              {t("contact")}
            </a>
          </nav>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-sm text-foreground/50 sm:flex-row sm:items-center">
          <p>{t("copyright", { year: new Date().getFullYear() })}</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-foreground">
              {t("privacy")}
            </a>
            <a href="#" className="hover:text-foreground">
              {t("terms")}
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
