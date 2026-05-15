import { useTranslations } from "next-intl"

export function MobileCtaBar() {
  const t = useTranslations("LP.MobileCta")

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 p-3 backdrop-blur-md lg:hidden">
      <a
        href="#demo"
        className="btn-brand flex w-full items-center justify-center rounded-full px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#1a6fd4]/30"
      >
        {t("label")}
      </a>
    </div>
  )
}
