"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  FileText,
  Sparkles,
  Pencil,
  Check,
  X,
  Loader2,
  Lock,
} from "lucide-react"
import { UpsellCard } from "@/components/shared/UpsellCard"
import { useCurrentClient } from "@/lib/hooks/use-current-client"
import type { ScriptSection } from "@/lib/db/scripts"
import { Badge } from "@/components/ui/badge"
import { scoreColorVar, toBarWidth, toDisplay5, scoreLevel } from "@/lib/score-display"
import type { ScriptIntelligenceResult } from "@/lib/mocks/data/script-intelligence"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActiveScript {
  id: string
  name: string
  description: string | null
  sections: ScriptSection[]
  is_active: boolean
}

interface PendingScriptInfo {
  orgScriptId: string
  startedAt: string
  sentByName: string | null
  incoming: { id: string; name: string; description: string | null; version: string }
  previous: { id: string; name: string; description: string | null; version: string } | null
}

type MainTab = "my-script" | "suggestion"


// ── View mode: one section card ────────────────────────────────────────────────

function SectionViewCard({ section }: { section: ScriptSection }) {
  const t = useTranslations("Dashboard.insights")
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--am-bg4)", background: "var(--am-bg2)" }}
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: "var(--am-bg4)" }}>
        <p className="font-semibold text-sm flex-1" style={{ color: "var(--am-text)" }}>
          {section.name}
        </p>
        {section.weight !== undefined && (
          <span className="text-xs font-mono" style={{ color: "var(--am-muted)" }}>
            {section.weight}%
          </span>
        )}
        {section.critical && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{ background: "rgba(255,94,94,0.15)", color: "var(--am-red)" }}
          >
            {t("myScript.critical")}
          </span>
        )}
      </div>
      <div className="px-5 py-4 space-y-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--am-muted)" }}>
            {t("myScript.instructions")}
          </p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--am-text)" }}>
            {section.instructions || <span style={{ color: "var(--am-muted)" }}>—</span>}
          </p>
        </div>
        {section.tips && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--am-muted)" }}>
              {t("myScript.tips")}
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--am-muted)" }}>
              {section.tips}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Edit mode: one section card ────────────────────────────────────────────────

function SectionEditField({
  section,
  index,
  onChange,
}: {
  section: ScriptSection
  index: number
  onChange: (index: number, updated: Partial<ScriptSection>) => void
}) {
  const t = useTranslations("Dashboard.insights")
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--am-accent)", background: "var(--am-bg2)" }}
    >
      {/* Section header — read-only, locked */}
      <div
        className="flex items-center gap-3 px-5 py-3 border-b"
        style={{ background: "var(--am-bg3)", borderColor: "var(--am-bg4)" }}
      >
        <Lock size={12} style={{ color: "var(--am-muted)", flexShrink: 0 }} />
        <p className="font-semibold text-sm flex-1" style={{ color: "var(--am-text)" }}>
          {section.name}
        </p>
        {section.weight !== undefined && (
          <span className="text-xs font-mono" style={{ color: "var(--am-muted)" }}>
            {section.weight}%
          </span>
        )}
        {section.critical && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{ background: "rgba(255,94,94,0.15)", color: "var(--am-red)" }}
          >
            {t("myScript.critical")}
          </span>
        )}
        <span className="text-[10px]" style={{ color: "var(--am-muted)" }}>
          {t("myScript.sectionNameLocked")}
        </span>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--am-muted)" }}>
            {t("myScript.instructions")}
          </p>
          <textarea
            rows={6}
            value={section.instructions}
            onChange={(e) => onChange(index, { instructions: e.target.value })}
            className="w-full px-3 py-2.5 rounded-md text-sm resize-y leading-relaxed"
            style={{
              background: "var(--am-bg3)",
              border: "1px solid var(--am-bg4)",
              color: "var(--am-text)",
            }}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--am-muted)" }}>
            {t("myScript.tips")}
          </p>
          <textarea
            rows={3}
            value={section.tips}
            onChange={(e) => onChange(index, { tips: e.target.value })}
            className="w-full px-3 py-2.5 rounded-md text-sm resize-y leading-relaxed"
            style={{
              background: "var(--am-bg3)",
              border: "1px solid var(--am-bg4)",
              color: "var(--am-text)",
            }}
          />
        </div>
      </div>
    </div>
  )
}


// ── Script Intelligence Modal ─────────────────────────────────────────────────

function SectionBar({ sections }: { sections: ScriptIntelligenceResult["sections"] }) {
  const colors: Record<string, string> = {
    opening: "#22D9A0",
    discovery: "#22D9A0",
    offer_presentation: "#FFAB2E",
    objection_handling: "#FFAB2E",
    close: "#FF5E5E",
  }
  return (
    <div className="flex rounded-full overflow-hidden h-3 w-full">
      {sections.map((s) => (
        <div
          key={s.id}
          title={`${s.name}: ${toDisplay5(s.score)}/5`}
          style={{ flex: 1, background: colors[s.id] ?? "var(--am-muted)" }}
        />
      ))}
    </div>
  )
}

function StatusBadge({ status, t }: { status: "strong" | "weak" | "missing"; t: ReturnType<typeof useTranslations> }) {
  if (status === "strong") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(34,217,160,0.15)", color: "var(--am-green)" }}>
      ✓ {t("sectionAnalysis.strong")}
    </span>
  )
  if (status === "weak") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(255,171,46,0.15)", color: "var(--am-amber)" }}>
      ⚠ {t("sectionAnalysis.weak")}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(255,94,94,0.15)", color: "var(--am-red)" }}>
      ✕ {t("sectionAnalysis.missing")}
    </span>
  )
}

function SuggestionItem({
  suggestion: s,
  initialDecision = "pending",
  initialEditedText,
  onDecisionChange,
  t,
}: {
  suggestion: ScriptIntelligenceResult["suggestions"][number]
  initialDecision?: "pending" | "accepted" | "rejected"
  initialEditedText?: string
  onDecisionChange: (decision: "pending" | "accepted" | "rejected", editedText: string) => void
  t: ReturnType<typeof useTranslations>
}) {
  const [decision, setDecision] = useState<"pending" | "accepted" | "rejected">(initialDecision)
  const [editing, setEditing] = useState(false)
  const [editedText, setEditedText] = useState(initialEditedText ?? s.suggestedQuote)

  const handleRewrite = () => {
    setEditing(true)
    setDecision("pending")
  }

  const handleSaveEdit = () => {
    setEditing(false)
    setDecision("accepted")
    onDecisionChange("accepted", editedText)
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setEditedText(initialEditedText ?? s.suggestedQuote)
  }

  const handleReject = () => {
    setDecision("rejected")
    setEditing(false)
    onDecisionChange("rejected", editedText)
  }

  const handleAccept = () => {
    setDecision("accepted")
    setEditing(false)
    onDecisionChange("accepted", editedText)
  }

  const handleUndo = () => {
    setDecision("pending")
    setEditing(false)
    onDecisionChange("pending", editedText)
  }

  const isDecided = decision !== "pending"

  return (
    <div
      className="space-y-3 pb-6 last:pb-0 border-b last:border-0"
      style={{ borderColor: "var(--am-bg4)" }}
    >
      {/* Header: nome da seção + badge + status + botões */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm" style={{ color: "var(--am-text)" }}>{s.sectionName}</span>
          {s.action === "rewrite" ? (
            <Badge
              variant="outline"
              className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
              style={{ borderColor: "var(--am-accent)", color: "var(--am-accent2)" }}
              onClick={!isDecided ? handleRewrite : undefined}
            >
              {t("aiSuggestions.rewrite")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs" style={{ borderColor: "var(--am-green)", color: "var(--am-green)" }}>
              + {t("aiSuggestions.addToScript")}
            </Badge>
          )}
          {decision === "accepted" && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ background: "rgba(34,217,160,0.15)", color: "var(--am-green)" }}>
              ✓ {t("suggestion.sectionApproved")}
            </span>
          )}
          {decision === "rejected" && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ background: "rgba(255,94,94,0.15)", color: "var(--am-red)" }}>
              ✕ {t("suggestion.sectionRejected")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isDecided && !editing && (
            <>
              {/* Rejeitar */}
              <Badge
                variant="outline"
                className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
                style={{ borderColor: "rgba(255,94,94,0.4)", color: "var(--am-red)" }}
                onClick={handleReject}
              >
                {t("suggestion.rejectSection")}
              </Badge>
              <Badge
                variant="outline"
                className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
                style={{ borderColor: "rgba(34,217,160,0.4)", color: "var(--am-green)" }}
                onClick={handleAccept}
              >
                {t("suggestion.approveSection")}
              </Badge>
            </>
          )}
          {isDecided && (
            <Badge
              variant="outline"
              className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
              style={{ borderColor: "var(--am-bg4)", color: "var(--am-muted)" }}
              onClick={handleUndo}
            >
              {decision === "accepted" ? t("suggestion.undoApprove") : t("suggestion.undoReject")}
            </Badge>
          )}
        </div>
      </div>

      {/* Sugestão: editável ou read-only */}
      <p className="text-xs font-medium" style={{ color: "var(--am-muted)" }}>
        {t("aiSuggestions.suggestedRewrite")}
      </p>

      {editing ? (
        <div className="space-y-2">
          <textarea
            rows={6}
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full px-3 py-2.5 rounded-md text-sm resize-y leading-relaxed"
            style={{
              background: "var(--am-bg3)",
              border: "1px solid var(--am-accent)",
              color: "var(--am-text)",
            }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveEdit}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded cursor-pointer font-medium"
              style={{ background: "var(--am-accent)", color: "#fff" }}
            >
              <Check size={11} />
              {t("myScript.save")}
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-xs px-3 py-1.5 rounded border cursor-pointer"
              style={{ borderColor: "var(--am-bg4)", color: "var(--am-muted)" }}
            >
              {t("myScript.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <blockquote
          className="text-sm italic p-3 rounded-md"
          style={{
            background: decision === "rejected" ? "rgba(255,94,94,0.05)" : "rgba(34,217,160,0.08)",
            color: decision === "rejected" ? "var(--am-muted)" : "var(--am-green)",
            border: `1px solid ${decision === "rejected" ? "rgba(255,94,94,0.2)" : "rgba(34,217,160,0.2)"}`,
            opacity: decision === "rejected" ? 0.5 : 1,
          }}
        >
          {editedText}
        </blockquote>
      )}

      <p className="text-xs" style={{ color: "var(--am-muted)" }}>{s.rationale}</p>
    </div>
  )
}

type DecisionState = { index: number; decision: "pending" | "accepted" | "rejected"; editedText: string }

function ScriptIntelligencePanel({
  result,
  loading,
  error,
  decisions,
  onDecisionsChange,
  t,
}: {
  result: ScriptIntelligenceResult | null
  loading: boolean
  error: string
  decisions: DecisionState[]
  onDecisionsChange: (d: DecisionState[]) => void
  t: ReturnType<typeof useTranslations>
}) {
  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--am-muted)" }} />
    </div>
  )

  if (error) return (
    <div className="p-4 rounded-lg border text-sm" style={{ background: "rgba(255,94,94,0.08)", borderColor: "var(--am-red)", color: "var(--am-red)" }}>
      {error}
    </div>
  )

  if (!result) return null

  return (
    <div className="space-y-6">
      {/* Health score */}
      <div className="rounded-xl border p-5" style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
        <div className="flex flex-col md:flex-row gap-6 md:items-center">
          <div className="shrink-0">
            <p className="text-xs mb-1" style={{ color: "var(--am-muted)" }}>{t("playbook.healthScore")}</p>
            <p className="font-bold">
              <span className="text-4xl font-mono" style={{ color: scoreColorVar(result.healthScore) }}>{toDisplay5(result.healthScore)}</span>
              <span className="text-xl ml-0.5" style={{ color: "var(--am-muted)" }}>/5</span>
            </p>
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium" style={{ color: "var(--am-muted)" }}>
              {t(`playbook.effectiveness.${result.effectivenessLabel}`)}
            </p>
            <SectionBar sections={result.sections} />
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {result.sections.map((s) => (
                <span key={s.id} className="text-xs font-mono" style={{ color: scoreLevel(s.score) === "low" ? "var(--am-red)" : scoreLevel(s.score) === "mid" ? "var(--am-amber)" : "var(--am-muted)" }}>
                  {s.name}: {toDisplay5(s.score)}
                </span>
              ))}
            </div>
          </div>
          <div className="md:max-w-[260px] text-sm" style={{ color: "var(--am-muted)" }}>
            {result.revenueLeak}
          </div>
        </div>
      </div>

      {/* Section analysis + AI suggestions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border" style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
          <div className="px-5 pt-5 pb-3">
            <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--am-muted)" }}>
              {t("sectionAnalysis.title")}
            </p>
          </div>
          <div className="px-5 pb-5 space-y-5">
            {result.sections.map((section) => (
              <div key={section.id} className="space-y-2 pb-5 last:pb-0 border-b last:border-0" style={{ borderColor: "var(--am-bg4)" }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-sm" style={{ color: "var(--am-text)" }}>{section.name}</span>
                  <span className="text-sm font-bold font-mono" style={{ color: scoreColorVar(section.score) }}>{toDisplay5(section.score)}/5</span>
                </div>
                <div className="w-full rounded-full h-1.5" style={{ background: "var(--am-bg4)" }}>
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${toBarWidth(section.score)}%`, background: scoreColorVar(section.score) }} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge status={section.status} t={t} />
                  {section.isMissingQuote && section.status !== "missing" && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(255,94,94,0.15)", color: "var(--am-red)" }}>
                      ✕ {t("sectionAnalysis.missing")}
                    </span>
                  )}
                </div>
                {section.quote && (
                  <blockquote className="text-sm italic pl-3 border-l-2" style={{ borderColor: section.status === "strong" ? "var(--am-green)" : "var(--am-red)", color: "var(--am-text)" }}>
                    {section.quote}
                  </blockquote>
                )}
                {section.isMissingQuote && !section.quote && (
                  <p className="text-sm italic pl-3 border-l-2" style={{ borderColor: "var(--am-red)", color: "var(--am-red)" }}>[No script for this section]</p>
                )}
                <p className="text-xs" style={{ color: "var(--am-muted)" }}>{section.usageStat}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border" style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
          <div className="px-5 pt-5 pb-3">
            <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--am-muted)" }}>
              {t("aiSuggestions.title")}
            </p>
          </div>
          <div className="px-5 pb-5 space-y-6">
            {result.suggestions.map((s, i) => {
              const saved = decisions.find((d) => d.index === i)
              return (
                <SuggestionItem
                  key={i}
                  suggestion={s}
                  initialDecision={saved?.decision ?? "pending"}
                  initialEditedText={saved?.editedText ?? s.suggestedQuote}
                  onDecisionChange={(decision, editedText) => {
                    const next = decisions.filter((d) => d.index !== i)
                    next.push({ index: i, decision, editedText })
                    onDecisionsChange(next)
                  }}
                  t={t}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Top closer phrases */}
      <div className="rounded-xl border" style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
        <div className="px-5 pt-5 pb-3">
          <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--am-muted)" }}>
            {t("topClosers.title")}
          </p>
        </div>
        <div className="px-5 pb-5 divide-y" style={{ borderColor: "var(--am-bg4)" }}>
          {result.topCloserPhrases.map((p, i) => (
            <div key={i} className="py-4 first:pt-0 last:pb-0 flex items-start gap-4">
              <div className="shrink-0 text-center w-14">
                <p className="text-lg font-bold font-mono" style={{ color: p.upliftType === "close" ? "var(--am-green)" : "var(--am-blue)" }}>{p.uplift}</p>
                <p className="text-[10px]" style={{ color: "var(--am-muted)" }}>{p.upliftType === "close" ? t("topClosers.closeRate") : t("topClosers.showRate")}</p>
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--am-muted)" }}>{p.section}</p>
                <blockquote className="text-sm italic" style={{ color: "var(--am-text)" }}>{p.quote}</blockquote>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const t = useTranslations("Dashboard.insights")
  const tUpsell = useTranslations("Shared.upsell.insightsRag")

  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<MainTab>(
    searchParams.get("tab") === "suggestion" ? "suggestion" : "my-script"
  )
  const [script, setScript] = useState<ActiveScript | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editedSections, setEditedSections] = useState<ScriptSection[]>([])
  const [editedName, setEditedName] = useState("")
  const [editedDescription, setEditedDescription] = useState("")
  const [pending, setPending] = useState<PendingScriptInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [intelligence, setIntelligence] = useState<ScriptIntelligenceResult | null>(null)
  const [intelligenceLoading, setIntelligenceLoading] = useState(false)
  const [intelligenceError, setIntelligenceError] = useState("")
  const [suggestionDecisions, setSuggestionDecisions] = useState<Array<{ index: number; decision: "pending" | "accepted" | "rejected"; editedText: string }>>([])
  const [orgScriptIdCache, setOrgScriptIdCache] = useState<string | null>(null)

  const { client: currentClient, loading: clientLoading } = useCurrentClient()
  const showRagUpsell = !clientLoading && !!currentClient && !currentClient.plan.hasRag

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [activeRes, pendingRes] = await Promise.all([
      fetch("/api/scripts/active"),
      fetch("/api/scripts/pending", { cache: "no-store" }),
    ])
    const activeJson = await activeRes.json()
    const pendingJson = await pendingRes.json()

    if (activeJson?.data?.script) {
      const s = activeJson.data.script as ActiveScript
      setScript(s)
      setEditedSections(s.sections)
      setEditedName(s.name)
      setEditedDescription(s.description ?? "")
    }

    const pendingData = pendingJson?.data?.pending ?? null
    setPending(pendingData)

    setLoading(false)
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])

  useEffect(() => {
    if (!toast) return
    const h = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(h)
  }, [toast])

  const handleSectionChange = (index: number, updated: Partial<ScriptSection>) => {
    setEditedSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updated } : s))
    )
  }

  const handleEnterEdit = () => {
    if (!script) return
    setEditedSections(script.sections.map((s) => ({ ...s })))
    setEditedName(script.name)
    setEditedDescription(script.description ?? "")
    setSaveError("")
    setEditMode(true)
  }

  const handleCancelEdit = () => {
    setEditMode(false)
    setSaveError("")
  }

  const handleSaveScript = async () => {
    if (!script) return
    setSaving(true)
    setSaveError("")
    try {
      const res = await fetch(`/api/scripts/${script.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editedName,
          description: editedDescription,
          sections: editedSections,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || t("myScript.saveError"))
      setScript({ ...script, name: editedName, description: editedDescription, sections: editedSections })
      setEditMode(false)
      setToast(t("myScript.saveSuccess"))
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("myScript.saveError"))
    } finally {
      setSaving(false)
    }
  }

  const handleAccept = async () => {
    if (!pending || busy) return
    setBusy("accept")
    setActionError(null)
    try {
      const res = await fetch("/api/scripts/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgScriptId: pending.orgScriptId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message)
      setToast(t("suggestion.accepted", { version: pending.incoming.version }))
      setPending(null)
      await fetchData()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("suggestion.actionError"))
    } finally {
      setBusy(null)
    }
  }

  const handleReject = async () => {
    if (!pending || busy) return
    setBusy("reject")
    setActionError(null)
    try {
      const res = await fetch("/api/scripts/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgScriptId: pending.orgScriptId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message)
      setToast(t("suggestion.rejected"))
      setPending(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("suggestion.actionError"))
    } finally {
      setBusy(null)
    }
  }

  const fetchIntelligence = useCallback(async (scriptId: string, currentScriptId?: string, orgScriptId?: string) => {
    setIntelligenceLoading(true)
    setIntelligenceError("")
    setIntelligence(null)
    setSuggestionDecisions([])

    try {
      // 1. Verificar cache primeiro
      if (orgScriptId) {
        const cacheRes = await fetch(`/api/script-intelligence/cache?orgScriptId=${orgScriptId}`)
        const cacheJson = await cacheRes.json()
        if (cacheJson?.data?.cache) {
          const cached = cacheJson.data.cache
          setIntelligence(cached.result)
          setSuggestionDecisions(cached.decisions ?? [])
          setOrgScriptIdCache(orgScriptId)
          setIntelligenceLoading(false)
          return
        }
      }

      // 2. Cache vazio — chamar IA
      const res = await fetch("/api/script-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId, currentScriptId }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error?.message || t("errors.generateFailed"))

      setIntelligence(json.data)
      setOrgScriptIdCache(orgScriptId ?? null)

      // 3. Salvar no cache
      if (orgScriptId) {
        void fetch("/api/script-intelligence/cache", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgScriptId, result: json.data }),
        })
      }
    } catch (err) {
      setIntelligenceError(err instanceof Error ? err.message : t("errors.unknown"))
    } finally {
      setIntelligenceLoading(false)
    }
  }, [t])

  const persistDecisions = useCallback((decisions: typeof suggestionDecisions) => {
    if (!orgScriptIdCache) return
    void fetch("/api/script-intelligence/cache", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgScriptId: orgScriptIdCache, decisions }),
    })
  }, [orgScriptIdCache])

  useEffect(() => {
    if (activeTab === "suggestion" && pending?.incoming?.id && !intelligence && !intelligenceLoading) {
      void fetchIntelligence(pending.incoming.id, script?.id, pending.orgScriptId)
    }
  }, [activeTab, pending, script, intelligence, intelligenceLoading, fetchIntelligence])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--am-muted)" }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--am-text)" }}>
          {t("title")}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--am-muted)" }}>
          {t("pageSubtitle")}
        </p>
      </div>

      {showRagUpsell && (
        <UpsellCard
          requires="pro_rag"
          title={tUpsell("title")}
          description={tUpsell("description")}
        />
      )}

      {/* Tabs */}
      <div
        className="inline-flex rounded-lg p-1"
        style={{ background: "var(--am-bg3)" }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("my-script")}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer"
          style={
            activeTab === "my-script"
              ? { background: "var(--am-bg2)", color: "var(--am-text)" }
              : { color: "var(--am-muted)" }
          }
        >
          <FileText size={14} />
          {t("tabs.myScript")}
        </button>
        <button
          type="button"
          onClick={() => pending && setActiveTab("suggestion")}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer"
          style={
            activeTab === "suggestion"
              ? { background: "var(--am-bg2)", color: "var(--am-text)" }
              : pending
                ? { color: "var(--am-muted)" }
                : { color: "var(--am-bg4)", cursor: "default" }
          }
          title={!pending ? t("tabs.noSuggestion") : undefined}
        >
          <Sparkles size={14} />
          {t("tabs.suggestion")}
          {pending && (
            <span
              className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--am-amber)", color: "#000" }}
            >
              1
            </span>
          )}
        </button>
      </div>

      {/* ── Tab: Meu Script ─────────────────────────────────────────────────── */}
      {activeTab === "my-script" && (
        <div className="space-y-4">
          {!script ? (
            <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
              <CardContent className="py-12 text-center">
                <p style={{ color: "var(--am-muted)" }}>{t("myScript.noScript")}</p>
              </CardContent>
            </Card>
          ) : editMode ? (
            /* ── MODO EDIÇÃO ── */
            <>
              {/* Edit header */}
              <div
                className="rounded-xl border px-5 py-4 flex items-center justify-between gap-4 flex-wrap"
                style={{ background: "rgba(110,86,255,0.08)", borderColor: "var(--am-accent)" }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--am-text)" }}>
                    {t("myScript.editingMode")}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--am-muted)" }}>
                    {t("myScript.sectionNamesFixed")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm border cursor-pointer disabled:opacity-50"
                    style={{ borderColor: "var(--am-bg4)", color: "var(--am-muted)" }}
                  >
                    <X size={14} />
                    {t("myScript.cancel")}
                  </button>
                  <Button
                    onClick={handleSaveScript}
                    disabled={saving}
                    style={{ background: "var(--am-accent)", color: "#fff" }}
                  >
                    {saving
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("myScript.saving")}</>
                      : <><Check size={14} className="mr-1.5" />{t("myScript.saveAll")}</>
                    }
                  </Button>
                </div>
              </div>

              {saveError && (
                <div
                  className="px-4 py-3 rounded-lg border text-sm"
                  style={{ background: "rgba(255,94,94,0.08)", borderColor: "var(--am-red)", color: "var(--am-red)" }}
                >
                  {saveError}
                </div>
              )}

              {/* Script name + description */}
              <div
                className="rounded-xl border px-5 py-4 space-y-4"
                style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}
              >
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--am-muted)" }}>
                    {t("myScript.scriptName")}
                  </p>
                  <input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-md text-sm font-medium"
                    style={{
                      background: "var(--am-bg3)",
                      border: "1px solid var(--am-bg4)",
                      color: "var(--am-text)",
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--am-muted)" }}>
                    {t("myScript.description")}
                  </p>
                  <textarea
                    rows={2}
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-md text-sm resize-none"
                    style={{
                      background: "var(--am-bg3)",
                      border: "1px solid var(--am-bg4)",
                      color: "var(--am-text)",
                    }}
                  />
                </div>
              </div>

              {/* Sections in edit mode */}
              <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--am-muted)" }}>
                {t("myScript.sectionsCount", { count: editedSections.length })}
              </p>
              <div className="space-y-3">
                {editedSections.map((section, i) => (
                  <SectionEditField
                    key={section.name}
                    section={section}
                    index={i}
                    onChange={handleSectionChange}
                  />
                ))}
              </div>

              {/* Bottom save bar */}
              <div
                className="sticky bottom-4 flex items-center justify-between px-5 py-3 rounded-xl border shadow-lg"
                style={{ background: "var(--am-bg2)", borderColor: "var(--am-accent)" }}
              >
                <p className="text-sm" style={{ color: "var(--am-muted)" }}>
                  {t("myScript.unsavedChanges")}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="px-4 py-1.5 rounded-md text-sm border cursor-pointer disabled:opacity-50"
                    style={{ borderColor: "var(--am-bg4)", color: "var(--am-muted)" }}
                  >
                    {t("myScript.cancel")}
                  </button>
                  <Button
                    onClick={handleSaveScript}
                    disabled={saving}
                    style={{ background: "var(--am-accent)", color: "#fff" }}
                  >
                    {saving
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("myScript.saving")}</>
                      : t("myScript.saveAll")
                    }
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* ── MODO VISUALIZAÇÃO ── */
            <>
              {/* Script header card */}
              <div
                className="rounded-xl border px-5 py-5"
                style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded"
                        style={{ background: "rgba(34,217,160,0.15)", color: "var(--am-green)" }}
                      >
                        {t("myScript.activeLabel")}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold" style={{ color: "var(--am-text)" }}>
                      {script.name}
                    </h2>
                    {script.description && (
                      <p className="text-sm mt-1" style={{ color: "var(--am-muted)" }}>
                        {script.description}
                      </p>
                    )}
                    <p className="text-xs mt-3" style={{ color: "var(--am-muted)" }}>
                      {t("myScript.sectionsCount", { count: script.sections.length })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleEnterEdit}
                    className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors cursor-pointer shrink-0"
                    style={{ borderColor: "var(--am-accent)", color: "var(--am-accent2)", background: "rgba(110,86,255,0.08)" }}
                  >
                    <Pencil size={14} />
                    {t("myScript.editScript")}
                  </button>
                </div>
              </div>

              {/* Sections in view mode */}
              <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--am-muted)" }}>
                {t("myScript.sections")}
              </p>
              <div className="space-y-3">
                {script.sections.map((section) => (
                  <SectionViewCard key={section.name} section={section} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Sugestão Pendente ───────────────────────────────────────────── */}
      {activeTab === "suggestion" && (
        <div className="space-y-5">
          {!pending ? (
            <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
              <CardContent className="py-12 text-center">
                <Sparkles className="mx-auto mb-3 h-8 w-8" style={{ color: "var(--am-muted)" }} />
                <p style={{ color: "var(--am-muted)" }}>{t("suggestion.noPending")}</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* ── Banner ── */}
              <div
                className="rounded-xl border px-6 py-5"
                style={{
                  background: "linear-gradient(to right, rgba(255,171,46,0.07), transparent)",
                  borderColor: "rgba(255,171,46,0.25)",
                }}
              >
                <div className="flex items-start justify-between gap-6 flex-wrap">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Sparkles size={15} style={{ color: "var(--am-amber)" }} />
                      <p className="font-semibold text-sm" style={{ color: "var(--am-text)" }}>
                        {t("suggestion.bannerTitle")}
                      </p>
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded border"
                        style={{ background: "rgba(255,171,46,0.15)", borderColor: "rgba(255,171,46,0.3)", color: "var(--am-amber)" }}
                      >
                        {t("suggestion.pendingApproval")}
                      </span>
                    </div>

                    <div className="flex items-center gap-5 flex-wrap text-sm">
                      <div>
                        <span style={{ color: "var(--am-muted)" }}>{t("suggestion.sentBy")}: </span>
                        <span style={{ color: "var(--am-text)" }}>{pending.sentByName ?? "Admin"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded border" style={{ borderColor: "var(--am-bg4)", color: "var(--am-text)" }}>
                          {script?.name ?? t("suggestion.currentScript")}
                        </span>
                        <span style={{ color: "var(--am-muted)" }}>→</span>
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded border" style={{ background: "rgba(255,171,46,0.1)", borderColor: "rgba(255,171,46,0.3)", color: "var(--am-amber)" }}>
                          {pending.incoming.name}
                        </span>
                      </div>
                    </div>

                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={!!busy}
                      className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors disabled:opacity-50 cursor-pointer"
                      style={{ borderColor: "rgba(255,94,94,0.3)", color: "var(--am-red)", background: "transparent" }}
                    >
                      {busy === "reject" ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                      {t("suggestion.rejectAll")}
                    </button>
                    <button
                      type="button"
                      onClick={handleAccept}
                      disabled={!!busy}
                      className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
                      style={{ background: "var(--am-green)", color: "#000" }}
                    >
                      {busy === "accept" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      {t("suggestion.approveAll")}
                    </button>
                  </div>
                </div>
                {actionError && (
                  <p className="mt-3 text-xs" style={{ color: "var(--am-red)" }}>{actionError}</p>
                )}
              </div>

              {/* ── Script Intelligence ── */}
              <div className="pt-2">
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-px flex-1" style={{ background: "var(--am-bg4)" }} />
                  <p className="text-xs font-medium uppercase tracking-widest shrink-0" style={{ color: "var(--am-muted)" }}>
                    {t("title")}
                  </p>
                  <div className="h-px flex-1" style={{ background: "var(--am-bg4)" }} />
                </div>
                <ScriptIntelligencePanel
                  result={intelligence}
                  loading={intelligenceLoading}
                  error={intelligenceError}
                  decisions={suggestionDecisions}
                  onDecisionsChange={(d) => {
                    setSuggestionDecisions(d)
                    persistDecisions(d)
                  }}
                  t={t}
                />
              </div>
            </>
          )}
        </div>
      )}


      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-lg border shadow-lg flex items-center gap-2"
          style={{ background: "var(--am-bg2)", borderColor: "var(--am-green)", color: "var(--am-text)" }}
          role="status"
        >
          <Check size={14} style={{ color: "var(--am-green)" }} />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </div>
  )
}
