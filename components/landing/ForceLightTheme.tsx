"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { useTheme } from "next-themes"

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
 * - useLayoutEffect (isomorphic) → roda antes do paint, reduz flash em hydrate
 * - MutationObserver no <html class> → se next-themes reaplicar `dark`
 *   (ex: storage listener disparado por outra aba que toggleou tema),
 *   reforçamos light imediatamente
 * - Cleanup lê o estado FRESCO de useTheme via ref → restaura corretamente
 *   o tema atual quando o user sai da LP, mesmo que tenha mudado durante
 *   a visita
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

export function ForceLightTheme() {
  const { theme, resolvedTheme } = useTheme()

  // Ref atualizada a cada render — cleanup lê valor atual, não snapshot.
  const themeStateRef = useRef({ theme, resolvedTheme })
  themeStateRef.current = { theme, resolvedTheme }

  useIsomorphicLayoutEffect(() => {
    const html = document.documentElement

    const forceLight = () => {
      if (html.classList.contains("dark")) html.classList.remove("dark")
      if (!html.classList.contains("light")) html.classList.add("light")
    }

    forceLight()

    // Observa mudanças em <html class>. Se next-themes (ou outro listener)
    // reaplicar `dark` enquanto estamos na LP, reverte de volta.
    const observer = new MutationObserver(forceLight)
    observer.observe(html, { attributes: true, attributeFilter: ["class"] })

    return () => {
      observer.disconnect()

      // Lê estado atual do tema (ref garante valor fresco). Fallback pra
      // localStorage se useTheme ainda não tiver settled.
      const current = themeStateRef.current
      const target =
        current.resolvedTheme ??
        current.theme ??
        (typeof window !== "undefined" ? localStorage.getItem("theme") : null)

      html.classList.remove("light")
      if (target === "dark") html.classList.add("dark")
    }
  }, [])

  return null
}
