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
 * - Snapshot do estado da classe ANTES de mexer — guarda a "verdade" inicial
 *   sem depender do useTheme (que pode não ter resolvido em nav rápida).
 * - useLayoutEffect (isomorphic) → roda antes do paint, reduz flash em hydrate.
 * - MutationObserver no <html class> → se next-themes reaplicar `dark`
 *   (ex: storage listener disparado por outra aba), reforçamos light.
 * - Cleanup garante que html sempre termina com EXATAMENTE uma classe
 *   ("light" ou "dark"). Sem essa garantia, html pode ficar sem nenhuma
 *   classe → CSS vars do dashboard ficam indefinidas e o logo (que usa
 *   `.dark` na cascata pra escolher fill) renderiza com cor errada.
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

export function ForceLightTheme() {
  useIsomorphicLayoutEffect(() => {
    const html = document.documentElement

    // Snapshot ANTES de qualquer mutação — fonte da verdade pro cleanup.
    // Lê localStorage como fallback porque o user pode ter aberto a LP
    // diretamente (sem ter passado por uma rota dark antes), caso em que
    // html.classList ainda não tem theme aplicado pelo next-themes.
    const hadDark =
      html.classList.contains("dark") ||
      (typeof window !== "undefined" && localStorage.getItem("theme") === "dark")

    const forceLight = () => {
      if (html.classList.contains("dark")) html.classList.remove("dark")
      if (!html.classList.contains("light")) html.classList.add("light")
    }

    forceLight()

    const observer = new MutationObserver(forceLight)
    observer.observe(html, { attributes: true, attributeFilter: ["class"] })

    return () => {
      observer.disconnect()

      // Sempre remove ambas antes de adicionar — evita estado intermediário
      // sem classe de tema (que é o que quebrava o logo do dashboard).
      html.classList.remove("light")
      html.classList.remove("dark")
      html.classList.add(hadDark ? "dark" : "light")
    }
  }, [])

  return null
}
