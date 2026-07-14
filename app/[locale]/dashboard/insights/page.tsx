"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useTranslations, useLocale } from "next-intl"
import {
  Sparkles,
  Check,
  X,
  Loader2,
  ChevronDown,
  FileText,
} from "lucide-react"
import { UpsellCard } from "@/components/shared/UpsellCard"
import { useCurrentClient } from "@/lib/hooks/use-current-client"
import { Badge } from "@/components/ui/badge"
import type { ScriptSection } from "@/lib/db/scripts"
import { scoreColorVar, toBarWidth, toDisplay5, scoreLevel } from "@/lib/score-display"
import type { ScriptIntelligenceResult } from "@/lib/mocks/data/script-intelligence"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActiveScript {
  id: string
  name: string
  description: string | null
  sections: ScriptSection[]
  full_script: string | null
  version: string
  is_active: boolean
}

interface PendingScriptInfo {
  orgScriptId: string
  startedAt: string
  sentByName: string | null
  // Status da análise IA do Script Intelligence comparativo. Enquanto for
  // 'processing' a aprovação fica desabilitada — owner precisa esperar a
  // análise terminar pra decidir com contexto.
  analysisStatus: 'processing' | 'queued' | 'ready' | 'error' | null
  incoming: { id: string; name: string; description: string | null; version: string }
  previous: { id: string; name: string; description: string | null; version: string } | null
}

// ── Script Intelligence ───────────────────────────────────────────────────────

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
  forceDecision,
  onDecisionChange,
  t,
}: {
  suggestion: ScriptIntelligenceResult["suggestions"][number]
  initialDecision?: "pending" | "accepted" | "rejected"
  initialEditedText?: string
  forceDecision?: "accepted" | "rejected"
  onDecisionChange: (decision: "pending" | "accepted" | "rejected", editedText: string) => void
  t: ReturnType<typeof useTranslations>
}) {
  const [decision, setDecision] = useState<"pending" | "accepted" | "rejected">(initialDecision)
  const [editing, setEditing] = useState(false)
  const [editedText, setEditedText] = useState(initialEditedText ?? s.suggestedQuote)

  const effectiveDecision = forceDecision ?? decision
  const isDecided = effectiveDecision !== "pending"

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
              onClick={!isDecided && !forceDecision ? handleRewrite : undefined}
            >
              {t("aiSuggestions.rewrite")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs" style={{ borderColor: "var(--am-green)", color: "var(--am-green)" }}>
              + {t("aiSuggestions.addToScript")}
            </Badge>
          )}
          {effectiveDecision === "accepted" && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ background: "rgba(34,217,160,0.15)", color: "var(--am-green)" }}>
              ✓ {t("suggestion.sectionApproved")}
            </span>
          )}
          {effectiveDecision === "rejected" && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ background: "rgba(255,94,94,0.15)", color: "var(--am-red)" }}>
              ✕ {t("suggestion.sectionRejected")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isDecided && !editing && !forceDecision && (
            <>
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
          {isDecided && !forceDecision && (
            <Badge
              variant="outline"
              className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
              style={{ borderColor: "var(--am-bg4)", color: "var(--am-muted)" }}
              onClick={handleUndo}
            >
              {effectiveDecision === "accepted" ? t("suggestion.undoApprove") : t("suggestion.undoReject")}
            </Badge>
          )}
        </div>
      </div>

      {/* Sugestão: editável, mensagem de resolução, ou read-only */}
      {!isDecided && (
        <>
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
                style={{ background: "var(--am-bg3)", border: "1px solid var(--am-accent)", color: "var(--am-text)" }}
              />
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleSaveEdit} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded cursor-pointer font-medium" style={{ background: "var(--am-accent)", color: "#fff" }}>
                  <Check size={11} />{t("myScript.save")}
                </button>
                <button type="button" onClick={handleCancelEdit} className="text-xs px-3 py-1.5 rounded border cursor-pointer" style={{ borderColor: "var(--am-bg4)", color: "var(--am-muted)" }}>
                  {t("myScript.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <blockquote
              className="text-sm italic p-3 rounded-md"
              style={{
                background: "rgba(34,217,160,0.08)",
                color: "var(--am-green)",
                border: "1px solid rgba(34,217,160,0.2)",
              }}
            >
              {editedText}
            </blockquote>
          )}
        </>
      )}

      {/* Status após decisão */}
      {isDecided && (
        <p
          className="text-xs p-2.5 rounded-md"
          style={{
            background: effectiveDecision === "rejected" ? "rgba(255,94,94,0.05)" : "rgba(34,217,160,0.05)",
            color: effectiveDecision === "rejected" ? "var(--am-red)" : "var(--am-green)",
            border: `1px solid ${effectiveDecision === "rejected" ? "rgba(255,94,94,0.2)" : "rgba(34,217,160,0.2)"}`,
          }}
        >
          {effectiveDecision === "rejected" ? t("suggestion.itemRejectedMsg") : t("suggestion.itemAcceptedMsg")}
        </p>
      )}

      {!isDecided && <p className="text-xs" style={{ color: "var(--am-muted)" }}>{s.rationale}</p>}
    </div>
  )
}

type DecisionState = { index: number; decision: "pending" | "accepted" | "rejected"; editedText: string }

// ── Left section card: score + editable script content ────────────────────────

function SectionLeftCard({
  intelSection,
  scriptSection,
  onSave,
  t,
}: {
  intelSection: ScriptIntelligenceResult["sections"][number]
  scriptSection: ScriptSection | null
  onSave: (updated: Partial<ScriptSection>) => void
  t: ReturnType<typeof useTranslations>
}) {
  const [editing, setEditing] = useState(false)
  const [instructions, setInstructions] = useState(scriptSection?.instructions ?? "")
  const [tips, setTips] = useState(scriptSection?.tips ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) {
      setInstructions(scriptSection?.instructions ?? "")
      setTips(scriptSection?.tips ?? "")
    }
  }, [scriptSection?.instructions, scriptSection?.tips, editing])

  const handleSave = async () => {
    setSaving(true)
    onSave({ instructions, tips })
    setSaving(false)
    setEditing(false)
  }

  const handleCancel = () => {
    setInstructions(scriptSection?.instructions ?? "")
    setTips(scriptSection?.tips ?? "")
    setEditing(false)
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
      {/* Header: name (fixed) + score */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: "var(--am-bg4)" }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-semibold text-sm" style={{ color: "var(--am-text)" }}>{intelSection.name}</span>
          {scriptSection?.weight !== undefined && (
            <span className="text-xs font-mono" style={{ color: "var(--am-muted)" }}>{scriptSection.weight}%</span>
          )}
          {scriptSection?.critical && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "rgba(255,94,94,0.15)", color: "var(--am-red)" }}>
              {t("myScript.critical")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-bold font-mono" style={{ color: scoreColorVar(intelSection.score) }}>
            {toDisplay5(intelSection.score)}/5
          </span>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs px-2.5 py-1 rounded border cursor-pointer"
              style={{ borderColor: "var(--am-accent)", color: "var(--am-accent2)", background: "rgba(110,86,255,0.08)" }}
            >
              {t("myScript.edit")}
            </button>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {/* Score bar + status */}
        <div className="w-full rounded-full h-1.5" style={{ background: "var(--am-bg4)" }}>
          <div className="h-1.5 rounded-full transition-all" style={{ width: `${toBarWidth(intelSection.score)}%`, background: scoreColorVar(intelSection.score) }} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={intelSection.status} t={t} />
          {intelSection.isMissingQuote && intelSection.status !== "missing" && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(255,94,94,0.15)", color: "var(--am-red)" }}>
              ✕ {t("sectionAnalysis.missing")}
            </span>
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--am-muted)" }}>{intelSection.usageStat}</p>

        {/* Divider */}
        <div className="h-px" style={{ background: "var(--am-bg4)" }} />

        {/* Instructions */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--am-muted)" }}>
            {t("myScript.instructions")}
          </p>
          {editing ? (
            <textarea
              rows={6}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full px-3 py-2.5 rounded-md text-sm resize-y leading-relaxed"
              style={{ background: "var(--am-bg3)", border: "1px solid var(--am-accent)", color: "var(--am-text)" }}
            />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--am-text)" }}>
              {instructions || <span style={{ color: "var(--am-muted)" }}>—</span>}
            </p>
          )}
        </div>

        {/* Tips */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--am-muted)" }}>
            {t("myScript.tips")}
          </p>
          {editing ? (
            <textarea
              rows={3}
              value={tips}
              onChange={(e) => setTips(e.target.value)}
              className="w-full px-3 py-2.5 rounded-md text-sm resize-y leading-relaxed"
              style={{ background: "var(--am-bg3)", border: "1px solid var(--am-bg4)", color: "var(--am-text)" }}
            />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--am-muted)" }}>
              {tips || <span style={{ color: "var(--am-bg4)" }}>—</span>}
            </p>
          )}
        </div>

        {/* Edit actions */}
        {editing && (
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded cursor-pointer disabled:opacity-50"
              style={{ background: "var(--am-accent)", color: "#fff" }}
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {t("myScript.save")}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded border cursor-pointer disabled:opacity-50"
              style={{ borderColor: "var(--am-bg4)", color: "var(--am-muted)" }}
            >
              {t("myScript.cancel")}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ScriptIntelligencePanel({
  result,
  loading,
  error,
  decisions,
  onDecisionsChange,
  scriptSections,
  onSaveSection,
  resolution,
  t,
}: {
  result: ScriptIntelligenceResult | null
  loading: boolean
  error: string
  decisions: DecisionState[]
  onDecisionsChange: (d: DecisionState[]) => void
  scriptSections: ScriptSection[]
  onSaveSection: (index: number, updated: Partial<ScriptSection>) => Promise<void>
  resolution?: "accepted" | "rejected" | null
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

      {/* Section analysis + AI suggestions — each section is its own card row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column header */}
        <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--am-muted)" }}>
          {t("sectionAnalysis.title")}
        </p>
        {/* Right column header */}
        <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--am-muted)" }}>
          {t("aiSuggestions.title")}
        </p>
      </div>

      <div className="space-y-4">
        {result.sections.map((section, i) => {
          const suggestion = result.suggestions.find(
            (s) => s.sectionName.toLowerCase() === section.name.toLowerCase()
          ) ?? result.suggestions[i]
          const saved = decisions.find((d) => d.index === i)
          const scriptSec = scriptSections.find(
            (s) => s.name.toLowerCase() === section.name.toLowerCase()
          ) ?? scriptSections[i] ?? null
          return (
            <div key={section.id} className="grid gap-4 lg:grid-cols-2">
              {/* Left: score + editable section content */}
              <SectionLeftCard
                intelSection={section}
                scriptSection={scriptSec}
                onSave={(updated) => onSaveSection(i, updated)}
                t={t}
              />

              {/* Right: AI suggestion card */}
              {suggestion ? (
                <div className="rounded-xl border p-5" style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
                  <SuggestionItem
                    suggestion={suggestion}
                    initialDecision={saved?.decision ?? "pending"}
                    initialEditedText={saved?.editedText ?? suggestion.suggestedQuote}
                    forceDecision={resolution ?? undefined}
                    onDecisionChange={(decision, editedText) => {
                      const next = decisions.filter((d) => d.index !== i)
                      next.push({ index: i, decision, editedText })
                      onDecisionsChange(next)
                      if (decision === "accepted") {
                        void onSaveSection(i, { instructions: editedText })
                      }
                    }}
                    t={t}
                  />
                </div>
              ) : (
                <div className="rounded-xl border p-5" style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
                  <p className="text-sm" style={{ color: "var(--am-muted)" }}>—</p>
                </div>
              )}
            </div>
          )
        })}
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

// ── Active Script (script atual da org) ─────────────────────────────────────────

function ActiveScriptPanel({
  script,
  t,
}: {
  script: ActiveScript
  t: ReturnType<typeof useTranslations>
}) {
  const [open, setOpen] = useState(false)
  const fullScript = script.full_script?.trim()

  return (
    <div className="pt-2">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-px flex-1" style={{ background: "var(--am-bg4)" }} />
        <p className="text-xs font-medium uppercase tracking-widest shrink-0" style={{ color: "var(--am-muted)" }}>
          {t("activeScript.title")}
        </p>
        <div className="h-px flex-1" style={{ background: "var(--am-bg4)" }} />
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-4 px-6 py-4 cursor-pointer text-left transition-colors hover:bg-[var(--am-bg3)]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(110,86,255,0.15)", color: "var(--am-accent2)" }}
            >
              <FileText size={17} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--am-text)" }}>
                  {script.name}
                </p>
                <span
                  className="font-mono text-[11px] px-1.5 py-0.5 rounded border shrink-0"
                  style={{ background: "rgba(34,217,160,0.1)", borderColor: "rgba(34,217,160,0.3)", color: "var(--am-green)" }}
                >
                  {t("activeScript.versionLabel", { version: script.version })}
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: "var(--am-muted)" }}>
                {t("activeScript.expandHint")}
              </p>
            </div>
          </div>
          <ChevronDown
            size={18}
            className="shrink-0 transition-transform duration-200"
            style={{ color: "var(--am-muted)", transform: open ? "rotate(180deg)" : "none" }}
          />
        </button>

        {open && (
          <div className="px-6 pb-6 pt-1 border-t" style={{ borderColor: "var(--am-bg4)" }}>
            {fullScript ? (
              <pre
                className="text-sm whitespace-pre-wrap font-sans leading-relaxed mt-4"
                style={{ color: "var(--am-text)" }}
              >
                {fullScript}
              </pre>
            ) : (
              <p className="text-sm mt-4" style={{ color: "var(--am-muted)" }}>
                {t("activeScript.empty")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const t = useTranslations("Dashboard.insights")
  const tUpsell = useTranslations("Shared.upsell.insightsRag")
  // Idioma atual — mandado no header x-locale pras rotas de script intelligence
  // traduzirem o conteúdo AI-generated na leitura (cache fica canônico em inglês).
  const locale = useLocale()

  const [script, setScript] = useState<ActiveScript | null>(null)
  const [pending, setPending] = useState<PendingScriptInfo | null>(null)
  const [resolution, setResolution] = useState<"accepted" | "rejected" | null>(null)
  const [resolvedScriptName, setResolvedScriptName] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [intelligence, setIntelligence] = useState<ScriptIntelligenceResult | null>(null)
  const [intelligenceLoading, _setIntelligenceLoading] = useState(false)
  const intelligenceLoadingRef = useRef(false)
  const setIntelligenceLoadingSync = useCallback((v: boolean) => {
    intelligenceLoadingRef.current = v
    _setIntelligenceLoading(v)
  }, [])
  const [intelligenceError, setIntelligenceError] = useState("")
  // Caso "primeira aprovação": org sem script ativo prévio recebe sugestão do
  // admin. Não há análise comparativa, mas owner ainda aprova/rejeita normalmente
  // pelo banner — mostramos um empty state no lugar do painel.
  const [firstApproval, setFirstApproval] = useState(false)
  const [suggestionDecisions, setSuggestionDecisions] = useState<Array<{ index: number; decision: "pending" | "accepted" | "rejected"; editedText: string }>>([])
  const [orgScriptIdCache, setOrgScriptIdCache] = useState<string | null>(null)

  const { client: currentClient, loading: clientLoading } = useCurrentClient()
  const showRagUpsell = !clientLoading && !!currentClient && !currentClient.plan.hasRag

  // Carregamento inicial: busca script ativo + pending em paralelo
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      const [activeRes, pendingRes] = await Promise.all([
        fetch("/api/scripts/active"),
        fetch("/api/scripts/pending", { cache: "no-store" }),
      ])
      const activeJson = await activeRes.json()
      const pendingJson = await pendingRes.json()

      if (activeJson?.data?.script) {
        setScript(activeJson.data.script as ActiveScript)
      }

      const pendingData = pendingJson?.data?.pending ?? null

      if (pendingData) {
        // Há pending ativo — limpa qualquer resolução anterior e mostra o pending
        localStorage.removeItem("sic_resolution")
        setResolution(null)
        setResolvedScriptName("")
        setIntelligence(null)
        setSuggestionDecisions([])
        intelligenceKeyRef.current = null
        setPending(pendingData)
        pendingOrgScriptIdRef.current = pendingData.orgScriptId
      } else {
        // Sem pending — tenta restaurar resolução salva
        setPending(null)
        try {
          const saved = localStorage.getItem("sic_resolution")
          if (saved) {
            const parsed = JSON.parse(saved) as { orgScriptId: string; resolution: "accepted" | "rejected"; scriptName: string }
            const cacheRes = await fetch(`/api/script-intelligence/cache?orgScriptId=${parsed.orgScriptId}`, { headers: { "x-locale": locale }, cache: "no-store" })
            const cacheJson = await cacheRes.json()
            const cached = cacheJson?.data?.cache
            if (cached?.resolution && cached?.result) {
              setResolution(cached.resolution)
              setResolvedScriptName(parsed.scriptName)
              setIntelligence(cached.result)
              setSuggestionDecisions(cached.decisions ?? [])
              setOrgScriptIdCache(parsed.orgScriptId)
              intelligenceKeyRef.current = parsed.orgScriptId
            }
          }
        } catch {
          // silencioso
        }
      }

      setLoading(false)
    }
    void init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Polling: detecta novo script pending enviado pelo admin em tempo real.
  const intelligenceKeyRef = useRef<string | null>(null)
  const pendingOrgScriptIdRef = useRef<string | null>(null)
  const analysisPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (pending || resolution) return

    const poll = async () => {
      try {
        const res = await fetch("/api/scripts/pending", { cache: "no-store" })
        const json = await res.json()
        const newPending = json?.data?.pending ?? null
        if (!newPending) return

        if (pendingOrgScriptIdRef.current !== newPending.orgScriptId) {
          pendingOrgScriptIdRef.current = newPending.orgScriptId
          intelligenceKeyRef.current = null
          localStorage.removeItem("sic_resolution")
          setResolution(null)
          setResolvedScriptName("")
          setIntelligence(null)
          setSuggestionDecisions([])
          setPending(newPending)
        } else {
          // Mesmo orgScriptId, mas analysisStatus pode ter avançado de
          // 'processing' → 'ready' / 'error'. Atualiza o objeto pra UI
          // liberar os botões accept/reject sem resetar intelligence/decisões.
          setPending((prev) =>
            prev?.analysisStatus !== newPending.analysisStatus ? newPending : prev,
          )
        }
      } catch {
        // silencioso
      }
    }

    const interval = setInterval(() => { void poll() }, 15_000)
    return () => clearInterval(interval)
  }, [pending, resolution])

  useEffect(() => {
    if (!toast) return
    const h = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(h)
  }, [toast])

  const handleAccept = async () => {
    if (!pending || busy) return
    if (pending.analysisStatus === 'processing') return
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
      const resolvedOrgScriptId = pending.orgScriptId
      const resolvedScriptName = pending.incoming.name
      setResolvedScriptName(resolvedScriptName)
      setResolution("accepted")
      setPending(null)
      localStorage.setItem("sic_resolution", JSON.stringify({ orgScriptId: resolvedOrgScriptId, resolution: "accepted", scriptName: resolvedScriptName }))
      void fetch("/api/script-intelligence/cache", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgScriptId: resolvedOrgScriptId, resolution: "accepted" }),
      })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("suggestion.actionError"))
    } finally {
      setBusy(null)
    }
  }

  const handleReject = async () => {
    if (!pending || busy) return
    if (pending.analysisStatus === 'processing') return
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
      const resolvedOrgScriptId = pending.orgScriptId
      const resolvedScriptName = pending.incoming.name
      setResolvedScriptName(resolvedScriptName)
      setResolution("rejected")
      setPending(null)
      localStorage.setItem("sic_resolution", JSON.stringify({ orgScriptId: resolvedOrgScriptId, resolution: "rejected", scriptName: resolvedScriptName }))
      void fetch("/api/script-intelligence/cache", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgScriptId: resolvedOrgScriptId, resolution: "rejected" }),
      })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("suggestion.actionError"))
    } finally {
      setBusy(null)
    }
  }

  const fetchIntelligence = useCallback(async (scriptId: string, currentScriptId?: string, orgScriptId?: string) => {
    if (analysisPollRef.current) {
      clearInterval(analysisPollRef.current)
      analysisPollRef.current = null
    }
    setIntelligenceLoadingSync(true)
    setIntelligenceError("")
    setIntelligence(null)
    setFirstApproval(false)
    setSuggestionDecisions([])

    try {
      // 1. Verificar cache primeiro
      if (orgScriptId) {
        const cacheRes = await fetch(`/api/script-intelligence/cache?orgScriptId=${orgScriptId}`, { headers: { "x-locale": locale }, cache: "no-store" })
        const cacheJson = await cacheRes.json()
        if (cacheJson?.data?.cache) {
          const cached = cacheJson.data.cache

          if (cached.analysis_status === 'processing') {
            setIntelligenceLoadingSync(true)
            setIntelligenceError("")
            analysisPollRef.current = setInterval(async () => {
              const pollRes = await fetch(`/api/script-intelligence/cache?orgScriptId=${orgScriptId}`, { headers: { "x-locale": locale }, cache: "no-store" })
              const pollJson = await pollRes.json()
              const pollCache = pollJson?.data?.cache
              if (pollCache?.analysis_status === 'ready') {
                clearInterval(analysisPollRef.current!)
                analysisPollRef.current = null
                setIntelligence(pollCache.result)
                setSuggestionDecisions(pollCache.decisions ?? [])
                setOrgScriptIdCache(orgScriptId)
                setIntelligenceLoadingSync(false)
                // Sincroniza o status do pending pra liberar accept/reject sem
                // depender do polling de /api/scripts/pending (que fica em
                // early-return enquanto há pending no state).
                setPending((prev) => (prev ? { ...prev, analysisStatus: 'ready' } : prev))
              } else if (pollCache?.analysis_status === 'error') {
                clearInterval(analysisPollRef.current!)
                analysisPollRef.current = null
                setIntelligenceError(t("errors.generateFailed"))
                setIntelligenceLoadingSync(false)
                setPending((prev) => (prev ? { ...prev, analysisStatus: 'error' } : prev))
              }
            }, 5000)
            return
          }

          if (cached.analysis_status === 'error') {
            setIntelligenceError(t("errors.generateFailed"))
            setIntelligenceLoadingSync(false)
            return
          }

          setIntelligence(cached.result)
          setSuggestionDecisions(cached.decisions ?? [])
          setOrgScriptIdCache(orgScriptId)
          setIntelligenceLoadingSync(false)
          return
        }
      }

      // 2. Cache vazio — chamar IA diretamente. Manda x-locale pra rota traduzir
      //    a resposta AI-generated por idioma (o cache do server fica em inglês).
      const res = await fetch("/api/script-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-locale": locale },
        body: JSON.stringify({ scriptId, currentScriptId }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error?.message || t("errors.generateFailed"))

      // Caso especial: backend sinaliza "primeira aprovação" — sem análise
      // comparativa porque a org não tem script ativo prévio. UI mostra empty
      // state, owner ainda aprova/rejeita pelo banner.
      if (json.data?.firstApproval === true) {
        setFirstApproval(true)
        setOrgScriptIdCache(orgScriptId ?? null)
        return
      }

      // A rota já traduziu json.data conforme o x-locale.
      setIntelligence(json.data)
      setOrgScriptIdCache(orgScriptId ?? null)

      // 3. Salvar no cache SOMENTE em inglês (canônico). Em outros idiomas NÃO
      //    cacheia (json.data está traduzido) — evita poluir o cache; o próximo
      //    load re-traduz (translateStrings tem cache) ou lê do cache do server.
      if (orgScriptId && locale === "en") {
        void fetch("/api/script-intelligence/cache", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgScriptId, result: json.data }),
        })
      }
    } catch (err) {
      setIntelligenceError(err instanceof Error ? err.message : t("errors.unknown"))
    } finally {
      setIntelligenceLoadingSync(false)
    }
  }, [t, locale])

  const persistDecisions = useCallback((decisions: typeof suggestionDecisions) => {
    if (!orgScriptIdCache) return
    void fetch("/api/script-intelligence/cache", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgScriptId: orgScriptIdCache, decisions }),
    })
  }, [orgScriptIdCache])

  useEffect(() => {
    if (loading) return
    if (intelligenceLoadingRef.current) return
    if (resolution) return

    const key = pending?.incoming?.id ?? script?.id ?? null
    if (!key) return
    if (intelligenceKeyRef.current === key) return

    intelligenceKeyRef.current = key
    setIntelligence(null)
    setSuggestionDecisions([])

    if (pending?.incoming?.id) {
      void fetchIntelligence(pending.incoming.id, script?.id, pending.orgScriptId)
    } else {
      void fetchIntelligence(script!.id, undefined, undefined)
    }

    return () => {
      if (analysisPollRef.current) {
        clearInterval(analysisPollRef.current)
        analysisPollRef.current = null
      }
    }
  }, [loading, pending?.incoming?.id, script?.id, fetchIntelligence, resolution])

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--am-text)" }}>
            {t("title")}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--am-muted)" }}>
            {t("pageSubtitle")}
          </p>
        </div>
      </div>

      {showRagUpsell && (
        <UpsellCard
          requires="pro_rag"
          title={tUpsell("title")}
          description={tUpsell("description")}
        />
      )}

      {/* ── Sugestão Pendente / Resolução ── */}
      {(pending || resolution) && (
        <div
          className="rounded-xl border px-6 py-5"
          style={{
            background: resolution
              ? resolution === "accepted"
                ? "linear-gradient(to right, rgba(34,217,160,0.07), transparent)"
                : "linear-gradient(to right, rgba(255,94,94,0.07), transparent)"
              : "linear-gradient(to right, rgba(255,171,46,0.07), transparent)",
            borderColor: resolution
              ? resolution === "accepted" ? "rgba(34,217,160,0.3)" : "rgba(255,94,94,0.3)"
              : "rgba(255,171,46,0.25)",
          }}
        >
          {resolution ? (
            /* Estado resolvido */
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold shrink-0"
                  style={{
                    background: resolution === "accepted" ? "rgba(34,217,160,0.15)" : "rgba(255,94,94,0.15)",
                    color: resolution === "accepted" ? "var(--am-green)" : "var(--am-red)",
                  }}
                >
                  {resolution === "accepted" ? "✓" : "✕"}
                </div>
                <div className="space-y-0.5">
                  <p className="font-semibold text-sm" style={{ color: "var(--am-text)" }}>
                    {resolution === "accepted" ? t("suggestion.resolutionAcceptedTitle") : t("suggestion.resolutionRejectedTitle")}
                  </p>
                  <p className="text-sm" style={{ color: "var(--am-muted)" }}>
                    {resolution === "accepted"
                      ? t("suggestion.resolutionAcceptedBody", { name: resolvedScriptName })
                      : t("suggestion.resolutionRejectedBody", { name: resolvedScriptName })}
                  </p>
                </div>
              </div>
              <p className="text-xs px-3 py-2 rounded-lg shrink-0" style={{ background: "var(--am-bg3)", color: "var(--am-muted)" }}>
                {t("suggestion.resolutionWaitNext")}
              </p>
            </div>
          ) : (
            /* Estado pendente */
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Sparkles size={15} style={{ color: "var(--am-amber)" }} />
                  <p className="font-semibold text-sm" style={{ color: "var(--am-text)" }}>
                    {t("suggestion.bannerTitle")}
                  </p>
                  {pending!.analysisStatus === 'processing' ? (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded border" style={{ background: "rgba(94,179,255,0.15)", borderColor: "rgba(94,179,255,0.3)", color: "var(--am-blue)" }}>
                      <Loader2 size={10} className="animate-spin" />
                      {t("suggestion.analyzing")}
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded border" style={{ background: "rgba(255,171,46,0.15)", borderColor: "rgba(255,171,46,0.3)", color: "var(--am-amber)" }}>
                      {t("suggestion.pendingApproval")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-5 flex-wrap text-sm">
                  <div>
                    <span style={{ color: "var(--am-muted)" }}>{t("suggestion.sentBy")}: </span>
                    <span style={{ color: "var(--am-text)" }}>{pending!.sentByName ?? "Admin"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded border" style={{ borderColor: "var(--am-bg4)", color: "var(--am-text)" }}>
                      {script?.name ?? t("suggestion.currentScript")}
                    </span>
                    <span style={{ color: "var(--am-muted)" }}>→</span>
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded border" style={{ background: "rgba(255,171,46,0.1)", borderColor: "rgba(255,171,46,0.3)", color: "var(--am-amber)" }}>
                      {pending!.incoming.name}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {(() => {
                  const analyzing = pending!.analysisStatus === 'processing'
                  const tooltip = analyzing ? t("suggestion.analyzingHint") : undefined
                  return (
                    <>
                      <button type="button" onClick={handleReject} disabled={!!busy || analyzing} title={tooltip} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer" style={{ borderColor: "rgba(255,94,94,0.3)", color: "var(--am-red)", background: "transparent" }}>
                        {busy === "reject" ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                        {t("suggestion.rejectAll")}
                      </button>
                      <button type="button" onClick={handleAccept} disabled={!!busy || analyzing} title={tooltip} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer" style={{ background: "var(--am-green)", color: "#000" }}>
                        {busy === "accept" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        {t("suggestion.approveAll")}
                      </button>
                    </>
                  )
                })()}
              </div>
            </div>
          )}
          {actionError && (
            <p className="mt-3 text-xs" style={{ color: "var(--am-red)" }}>{actionError}</p>
          )}
        </div>
      )}

      {/* ── First approval empty state — org sem script ativo prévio ── */}
      {firstApproval && (
        <div className="pt-2">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1" style={{ background: "var(--am-bg4)" }} />
            <p className="text-xs font-medium uppercase tracking-widest shrink-0" style={{ color: "var(--am-muted)" }}>
              {t("title")}
            </p>
            <div className="h-px flex-1" style={{ background: "var(--am-bg4)" }} />
          </div>
          <div
            className="rounded-2xl border p-6 flex items-start gap-4"
            style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}
          >
            <Sparkles size={20} style={{ color: "var(--am-accent2)" }} className="shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold" style={{ color: "var(--am-text)" }}>
                {t("firstApproval.title")}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--am-muted)" }}>
                {t("firstApproval.body")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Script Intelligence — sempre visível quando há script ativo ── */}
      {(intelligence || intelligenceLoading || (intelligenceError && !intelligenceError.includes("No calls"))) && (
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
            scriptSections={script?.sections ?? []}
            onSaveSection={async (index, updated) => {
              if (!script) return
              const newSections = script.sections.map((s, i) => i === index ? { ...s, ...updated } : s)
              const res = await fetch(`/api/scripts/${script.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sections: newSections }),
              })
              if (res.ok) setScript({ ...script, sections: newSections })
            }}
            resolution={resolution}
            t={t}
          />
        </div>
      )}

      {/* ── Script atual da org — expansível com versão e texto completo ── */}
      {script && <ActiveScriptPanel script={script} t={t} />}

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
