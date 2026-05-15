import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function DemoForm() {
  const t = useTranslations("LP.Demo");
  const bullets = t.raw("bullets") as string[];
  // formUrl/formId vêm de i18n para permitir versões traduzidas do GHL form
  // por locale. Hoje todos os locales apontam pro mesmo ID; quando Ariel criar
  // forms traduzidos no GHL, basta trocar o valor em messages/<locale>.json.
  const formUrl = t("formUrl");
  const formId = t("formId");
  const formName = t("formName");

  return (
    <section id="demo" className="relative">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-foreground/50">
              {t("eyebrow")}
            </p>
            <h2 className="mt-4 text-balance text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {t("titlePart1")}{" "}
              <span className="text-brand-gradient">{t("titleHighlight")}</span>
            </h2>
            <p className="mt-5 text-pretty text-lg italic leading-relaxed text-foreground/60">
              {t("subtitle")}
            </p>

            <ul className="mt-8 space-y-3">
              {bullets.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-base text-foreground/80"
                >
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#1a6fd4]"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* bg-white + border-black permanentes: o iframe GHL é cross-origin
             (não conseguimos estilizar o conteúdo). Mantemos uma "ilha clara"
             com borda forte que se destaca em light e dark mode. */}
          <div className="rounded-2xl border-2 border-black bg-white p-6 shadow-xl shadow-black/10 sm:p-8">
            <iframe
              key={formUrl}
              src={formUrl}
              style={{
                width: "100%",
                height: "463px",
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
              data-form-name={formName}
              data-height="463"
              data-layout-iframe-id={`inline-${formId}`}
              data-form-id={formId}
              title={t("formTitle")}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
