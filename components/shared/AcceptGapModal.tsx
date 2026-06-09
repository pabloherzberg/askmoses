"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Check, X, Loader2, ArrowRight } from "lucide-react"
import type { ScriptGap } from "@/lib/types"
import type { ScriptSection } from "@/lib/db/scripts"

// Accept Gap — exibe o diff (instrução atual vs sugestão) e, ao confirmar,
// persiste em dois passos com responsabilidades separadas:
//   1. POST /api/script-gaps/:id/accept  → grava accepted_at (some do dashboard)
//   2. PATCH /api/scripts/:id            → reescreve APENAS o trecho com atrito
//      (a section cujo nome casa com gap.section, ou o trecho dentro de
//      full_script) — nunca o script inteiro.
// Em demo (sem sessão Supabase real) ambos retornam 401/404; tratamos de forma
// graciosa e aplicamos o aceite no estado local de qualquer forma.
export function AcceptGapModal({
  gap,
  onClose,
  onAccepted,
}: {
  gap: ScriptGap
  onClose: () => void
  onAccepted: (gapId: string) => void
}) {
  const t = useTranslations("Shared.scriptGapDetection")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onClose])

  const handleConfirm = useCallback(async () => {
    setBusy(true)
    try {
      // 1) Marca o gap como aceito (persiste accepted_at).
      await fetch(`/api/script-gaps/${gap.id}/accept`, { method: "POST" })

      // 2) Reescreve só o trecho do gap no script ativo da org.
      const res = await fetch("/api/scripts?active=true", { cache: "no-store" })
      const json = await res.json().catch(() => null)
      const script = Array.isArray(json?.data) ? json.data[0] : json?.data
      if (script?.id) {
        const sections: ScriptSection[] = Array.isArray(script.sections) ? script.sections : []
        const idx = sections.findIndex(
          (s) => s.name?.toLowerCase().trim() === gap.section.toLowerCase().trim(),
        )

        const patch: Record<string, unknown> = {}
        if (idx !== -1) {
          // Reescreve só as instruções da section com atrito.
          const next = sections.map((s, i) =>
            i === idx ? { ...s, instructions: gap.suggestedFix } : s,
          )
          patch.sections = next
        } else if (
          typeof script.full_script === "string" &&
          script.full_script.includes(gap.scriptInstruction)
        ) {
          // Fallback: troca só o trecho literal dentro do full_script.
          patch.full_script = script.full_script.replace(gap.scriptInstruction, gap.suggestedFix)
        }

        if (Object.keys(patch).length > 0) {
          await fetch(`/api/scripts/${script.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          })
        }
      }
    } catch (err) {
      // Demo / sem sessão real — não quebra a UI.
      console.warn("[script-gap] persistência falhou (esperado na demo):", err)
    } finally {
      onAccepted(gap.id)
      setBusy(false)
      onClose()
    }
  }, [gap, onAccepted, onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        className="w-full max-w-xl rounded-2xl border overflow-hidden"
        style={{ background: "var(--am-bg2)", borderColor: "var(--am-border)" }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b" style={{ borderColor: "var(--am-border)" }}>
          <p className="text-xs uppercase tracking-widest" style={{ color: "var(--am-muted)" }}>
            {t("modal.title")}
          </p>
          <h2 className="text-base font-semibold mt-1" style={{ color: "var(--am-text)" }}>
            {gap.section}
          </h2>
        </div>

        {/* Diff */}
        <div className="px-6 py-5 space-y-3">
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--am-muted)" }}>
              {t("modal.current")}
            </p>
            <p
              className="text-sm rounded-lg px-3 py-2 line-through"
              style={{ background: "rgba(255,94,94,0.15)", color: "var(--am-red)" }}
            >
              {gap.scriptInstruction}
            </p>
          </div>
          <div className="flex justify-center" style={{ color: "var(--am-muted)" }}>
            <ArrowRight size={16} className="rotate-90" />
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--am-muted)" }}>
              {t("modal.suggested")}
            </p>
            <p
              className="text-sm rounded-lg px-3 py-2"
              style={{ background: "rgba(34,217,160,0.15)", color: "var(--am-green)" }}
            >
              {gap.suggestedFix}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 border-t flex items-center justify-end gap-3"
          style={{ borderColor: "var(--am-border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
            style={{ color: "var(--am-muted)" }}
          >
            <X size={15} /> {t("modal.cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-60"
            style={{ background: "var(--am-accent)" }}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {t("modal.confirm")}
          </button>
        </div>
      </div>
    </div>
  )
}
