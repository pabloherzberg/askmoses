"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2 } from "lucide-react"
import type { AnalysisStatusItem } from "@/app/api/admin/scripts/analysis-status/route"

function formatElapsed(updatedAt: string): string {
  const diff = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  return `${Math.floor(diff / 3600)}h`
}

export function ScriptAnalysisBanner() {
  const [items, setItems] = useState<AnalysisStatusItem[]>([])
  const [visible, setVisible] = useState(false)

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/scripts/analysis-status", { cache: "no-store" })
      const json = await res.json()
      const newItems: AnalysisStatusItem[] = json?.data?.items ?? []
      setItems(newItems)
      setVisible(newItems.length > 0)
    } catch {
      // silencioso
    }
  }, [])

  useEffect(() => {
    void poll()
    const interval = setInterval(() => { void poll() }, 5000)
    return () => clearInterval(interval)
  }, [poll])

  if (!visible || items.length === 0) return null

  return (
    <div
      className="rounded-xl border px-5 py-4 mb-4"
      style={{
        background: "linear-gradient(to right, rgba(110,86,255,0.07), transparent)",
        borderColor: "rgba(110,86,255,0.3)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Loader2 size={14} className="animate-spin shrink-0" style={{ color: "var(--am-accent2)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--am-text)" }}>
          Análise de IA em andamento
        </p>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded border"
          style={{ background: "rgba(110,86,255,0.12)", borderColor: "rgba(110,86,255,0.3)", color: "var(--am-accent2)" }}
        >
          {items.length} {items.length === 1 ? "org" : "orgs"}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.orgScriptId}
            className="flex items-center justify-between gap-4 px-3 py-2 rounded-lg"
            style={{ background: "var(--am-bg3)" }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                style={{ background: "var(--am-accent2)" }}
              />
              <span className="text-sm font-medium truncate" style={{ color: "var(--am-text)" }}>
                {item.orgName}
              </span>
              <span className="text-xs shrink-0" style={{ color: "var(--am-muted)" }}>
                →
              </span>
              <span className="text-xs truncate font-mono" style={{ color: "var(--am-accent2)" }}>
                {item.scriptName}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px]" style={{ color: "var(--am-muted)" }}>
                {formatElapsed(item.updatedAt)} atrás
              </span>
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded"
                style={{ background: "rgba(110,86,255,0.15)", color: "var(--am-accent2)" }}
              >
                Analisando...
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] mt-3" style={{ color: "var(--am-muted)" }}>
        O script só ficará visível para o owner após a análise ser concluída.
      </p>
    </div>
  )
}
