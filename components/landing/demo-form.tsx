import { CheckCircle2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import type { Locale } from "@/i18n/routing"

// Form IDs do GHL por locale. Hoje todos apontam pro mesmo form (EN);
// quando Ariel criar versões traduzidas no GHL, trocar o id aqui.
// Não mora no i18n pra evitar parsing ICU em URLs/IDs e duplicação de
// strings de config entre arquivos de tradução.
const GHL_FORM_BY_LOCALE: Record<Locale, string> = {
  en: "ADEpZV9ukkUoRuLJobxh",
  pt: "ADEpZV9ukkUoRuLJobxh",
  es: "ADEpZV9ukkUoRuLJobxh",
  fr: "ADEpZV9ukkUoRuLJobxh",
}

const GHL_WIDGET_BASE = "https://business.unleashedconsulting.com/widget/form"
const GHL_FORM_NAME = "AskMoses Form"

export function DemoForm() {
  const t = useTranslations("LP.Demo")
  const locale = useLocale() as Locale
  const bullets = t.raw("bullets") as string[]
  const formId = GHL_FORM_BY_LOCALE[locale]
  const formUrl = `${GHL_WIDGET_BASE}/${formId}`

  return (
    <section id="demo" className="relative">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-foreground/50">{t("eyebrow")}</p>
            <h2 className="mt-4 text-balance text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {t("titlePart1")} <span className="text-brand-gradient">{t("titleHighlight")}</span>
            </h2>
            <p className="mt-5 text-pretty text-lg italic leading-relaxed text-foreground/60">
              {t("subtitle")}
            </p>

            <ul className="mt-8 space-y-3">
              {bullets.map((item) => (
                <li key={item} className="flex items-start gap-3 text-base text-foreground/80">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#1a6fd4]" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* bg-white + border-black permanentes: o iframe GHL é cross-origin
             (não conseguimos estilizar o conteúdo). Mantemos uma "ilha clara"
             com borda forte que se destaca em light e dark mode. */}
          <div className="rounded-2xl border-2 border-black bg-white p-6 shadow-xl shadow-black/10 sm:p-8">
            {/* minHeight em vez de height fixa: o form_embed.js da GHL
               injeta auto-resize via postMessage usando data-height +
               data-layout-iframe-id, mas a ordem do script async não é
               garantida. min-height evita scroll interno cortando o submit. */}
            <iframe
              key={formUrl}
              src={formUrl}
              style={{
                width: "100%",
                minHeight: "463px",
                border: "none",
                borderRadius: "8px",
              }}
              id={`inline-${formId}`}
              data-layout="{'id':'INLINE'}"
              data-trigger-type="alwaysShow"
              data-trigger-value=""
              data-activation-type="alwaysActivated"
              data-activation-value=""
              data-deactivation-type="neverDeactivate"
              data-deactivation-value=""
              data-form-name={GHL_FORM_NAME}
              data-height="463"
              data-layout-iframe-id={`inline-${formId}`}
              data-form-id={formId}
              title={t("formTitle")}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
