import {
  PhoneCall,
  Stethoscope,
  Sparkles,
  Wrench,
  Scale,
  Dog,
} from "lucide-react";
import { useTranslations } from "next-intl";

// "Dog Trainers" mantido como nicho atendido (decisão revisada da PO — TC-05
// original pedia copy genérico mas o time confirmou que reflete o segmento real).
const industryKeys = [
  { id: "dogTrainers", icon: Dog },
  { id: "callCenters", icon: PhoneCall },
  { id: "vet", icon: Stethoscope },
  { id: "beauty", icon: Sparkles },
  { id: "homeServices", icon: Wrench },
  { id: "lawFirms", icon: Scale },
] as const;

export function Industries() {
  const t = useTranslations("LP.Industries");

  return (
    <section id="industries">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-foreground/50">
            {t("eyebrow")}
          </p>
          <h2 className="mt-4 text-balance text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {t("title")}
          </h2>
          <p className="mt-5 text-pretty text-lg italic leading-relaxed text-foreground/60">
            {t("subtitle")}
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {industryKeys.map((industry) => {
            const Icon = industry.icon;
            return (
              <div
                key={industry.id}
                className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-[#00c2e0]/50 hover:shadow-lg"
              >
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-md shadow-[#1a6fd4]/20">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="text-base font-semibold text-foreground">
                  {t(`items.${industry.id}`)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-12 flex justify-center">
          <a
            href="#demo"
            className="btn-brand inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#1a6fd4]/20"
          >
            {t("cta")}
          </a>
        </div>
      </div>
    </section>
  );
}
