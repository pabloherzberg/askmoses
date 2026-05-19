"use client"

import { useEffect, useLayoutEffect } from "react"

/**
 * Força a LP em light mode mesmo se o user tiver dark preference em outras
 * rotas. Decisão Vitor.
 *
 * Por que não basta `className="light"` no wrapper? Portais Radix (dropdown,
 * sheet, dialog) renderizam fora da tree, direto no body, e leem CSS vars
 * do <html>. Se o html tiver `.dark`, os portais ficam escuros.
 *
 * Por que não basta `setTheme("light")` do next-themes? Porque persiste em
 * localStorage e quebra a preferência do user nas outras rotas.
 *
 * Estratégia:
 * - useLayoutEffect (isomorphic) → roda antes do paint, reduz flash em hydrate.
 * - MutationObserver no <html class> → se next-themes reaplicar `dark`
 *   (ex: storage listener disparado por outra aba), reforçamos light.
 * - Cleanup re-resolve o tema atual a partir do localStorage (não do useTheme,
 *   que pode não ter resolvido em nav rápida). Cobre `"system"` via matchMedia
 *   pra ficar defensivo se ThemeProvider passar a usar `enableSystem`, e
 *   respeita mudanças cross-tab que aconteceram durante a visita à LP.
 *   Snapshot do mount serve como fallback se localStorage virou inacessível.
 * - Cleanup garante que html sempre termina com EXATAMENTE uma classe
 *   ("light" ou "dark"). Sem essa garantia, html pode ficar sem nenhuma
 *   classe → CSS vars do dashboard ficam indefinidas e o logo (que usa
 *   `.dark` na cascata pra escolher fill) renderiza com cor errada.
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

type ResolvedTheme = "light" | "dark"

// Reproduz a lógica do next-themes pra determinar qual classe estaria no html
// se a LP não estivesse forçando light. Mantida em sync com defaultTheme="light"
// definido em app/[locale]/layout.tsx.
function resolveStoredTheme(): ResolvedTheme | null {
  if (typeof window === "undefined") return null
  try {
    const stored = window.localStorage.getItem("theme")
    if (stored === "dark" || stored === "light") return stored
    if (stored === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
    }
    // null (user nunca toggleou) → cai pro defaultTheme do provider.
    return stored === null ? "light" : null
  } catch {
    // localStorage pode estar desabilitado (private mode, sandbox) — sinaliza
    // pro caller usar o snapshot do mount.
    return null
  }
}

export function ForceLightTheme() {
  useIsomorphicLayoutEffect(() => {
    const html = document.documentElement

    // Snapshot do mount como fallback de último recurso (storage inacessível
    // no cleanup). Combina html.classList (estado real aplicado pelo
    // next-themes script) com resolveStoredTheme (caso classList ainda esteja
    // vazia em nav muito rápida).
    const snapshot: ResolvedTheme = html.classList.contains("dark")
      ? "dark"
      : html.classList.contains("light")
        ? "light"
        : resolveStoredTheme() ?? "light"

    const forceLight = () => {
      if (html.classList.contains("dark")) html.classList.remove("dark")
      if (!html.classList.contains("light")) html.classList.add("light")
    }

    forceLight()

    const observer = new MutationObserver(forceLight)
    observer.observe(html, { attributes: true, attributeFilter: ["class"] })

    return () => {
      observer.disconnect()

      // Prioriza storage atual (respeita cross-tab toggle e matchMedia pra
      // "system"); snapshot só é usado se storage virou inacessível.
      const target: ResolvedTheme = resolveStoredTheme() ?? snapshot

      // Sempre remove ambas antes de adicionar — evita estado intermediário
      // sem classe de tema (que é o que quebrava o logo do dashboard).
      html.classList.remove("light")
      html.classList.remove("dark")
      html.classList.add(target)
    }
  }, [])

  return null
}
