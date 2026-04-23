"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { LogoSVG } from "@/components/shared/LogoSVG";

export function Navigation() {
  const t = useTranslations("Landing.Nav");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { label: t("overview"), href: "#overview" },
    { label: t("workflow"), href: "#workflow" },
    { label: t("features"), href: "#features" },
    { label: t("metrics"), href: "#metrics" },
    { label: t("roadmap"), href: "#roadmap" },
    { label: t("pricing"), href: "#pricing" },
    { label: t("appendix"), href: "#appendix" },
  ];

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled || menuOpen
          ? "bg-background/80 backdrop-blur-md border-b border-border"
          : ""
        }`}
    >
      <div className="container mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LogoSVG className="h-14" />
        </div>
        <div className="hidden md:flex items-center gap-6">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {item.label}
            </a>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-4">
          <LanguageSwitcher />
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link href="/presentation">{t("presentation")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/login">{t("dashboard")}</Link>
          </Button>
        </div>
        <button
          className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label={t("toggleMenu")}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {menuOpen && (
        <div className="md:hidden bg-background/95 backdrop-blur-md border-t border-border px-6 py-4 flex flex-col gap-4">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {item.label}
            </a>
          ))}
          <div className="flex flex-col gap-2 pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
            <Button asChild variant="ghost" size="sm" className="justify-start">
              <Link href="/presentation" onClick={() => setMenuOpen(false)}>
                {t("presentation")}
              </Link>
            </Button>
            <Button asChild size="sm" className="justify-start">
              <Link href="/login" onClick={() => setMenuOpen(false)}>
                {t("dashboard")}
              </Link>
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}
