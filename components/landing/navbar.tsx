"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { LogoSVG } from "@/components/shared/LogoSVG";

/**
 * Navbar específica da landing page (`/`). Não é genérica — usa âncoras
 * intra-página (#how-it-works, #demo, etc.) que só existem na LP. Se for
 * preciso navbar em outra rota pública, criar outro componente ou tornar
 * os links configuráveis via props.
 */
export function Navbar() {
  const t = useTranslations("LP.Nav");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { key: "howItWorks", href: "#how-it-works" },
    { key: "benefits", href: "#benefits" },
    { key: "industries", href: "#industries" },
    { key: "pricing", href: "#pricing" },
  ] as const;

  // Pattern alinhado com components/navigation.tsx (usado em /presentation, /demobiz, /tech):
  // nav fixa transparente, ganha background quando scrolled OR menu mobile aberto.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled || menuOpen
          ? "bg-background/80 backdrop-blur-md border-b border-border"
          : ""
      }`}
    >
      <div className="container mx-auto px-6 py-5 lg:py-4 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2"
          aria-label={t("homeAriaLabel")}
        >
          <LogoSVG className="h-14" alt={t("logoAlt")} />
        </Link>

        {/* Nav links e right cluster aparecem a partir de lg (>=1024px).
           Abaixo disso, hamburger menu — md (768px) ficava apertado e
           quebrava texto multi-palavra (ex: "How it works") em duas linhas. */}
        <div className="hidden lg:flex items-center gap-6">
          {navItems.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className="whitespace-nowrap text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t(item.key)}
            </a>
          ))}
        </div>

        <div className="hidden lg:flex items-center gap-4">
          <LanguageSwitcher />
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">{t("dashboard")}</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="btn-brand text-white hover:text-white"
          >
            <a href="#demo">{t("bookDemo")}</a>
          </Button>
        </div>

        <button
          type="button"
          className="lg:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label={menuOpen ? t("closeMenu") : t("openMenu")}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {menuOpen && (
        <div className="lg:hidden bg-background/95 backdrop-blur-md border-t border-border px-6 py-4 flex flex-col gap-4">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t(item.key)}
            </a>
          ))}
          <div className="flex flex-col gap-2 pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <LanguageSwitcher variant="outline" />
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="justify-start"
            >
              <Link href="/dashboard" onClick={() => setMenuOpen(false)}>
                {t("dashboard")}
              </Link>
            </Button>
            {/* Book My Free Demo intencionalmente omitido aqui — o
               MobileCtaBar já fixa o CTA flutuante no fundo da tela nessa
               breakpoint, então duplicar no menu vira ruído visual. */}
          </div>
        </div>
      )}
    </nav>
  );
}
