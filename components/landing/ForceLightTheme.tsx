"use client"

import { useEffect } from "react"

/**
 * Força a LP em light mode mesmo se o user tiver dark preference em outras
 * rotas. Manipula `<html class>` diretamente em vez de usar next-themes'
 * setTheme — não queremos persistir a preferência (o user volta pro dark
 * dele quando sair da LP).
 *
 * Por que não basta o `className="light"` no wrapper? Porque portais (Radix
 * dropdown, Sheet, Dialog) renderizam fora da tree da LP, direto no body,
 * e leem CSS vars do html. Se html tiver `.dark`, esses portais ficam
 * escuros independente do wrapper. Decisão Vitor: LP sempre light.
 */
export function ForceLightTheme() {
  useEffect(() => {
    const html = document.documentElement
    const wasDark = html.classList.contains("dark")

    if (wasDark) {
      html.classList.remove("dark")
      html.classList.add("light")
    }

    return () => {
      if (wasDark) {
        html.classList.remove("light")
        html.classList.add("dark")
      }
    }
  }, [])

  return null
}
