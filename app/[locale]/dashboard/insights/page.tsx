"use client"

import { useState, useEffect } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Brain,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  FileText,
  Users,
  BarChart3,
  ThumbsUp,
  ThumbsDown,
  MessageSquareWarning,
  Save,
} from "lucide-react"
import { UpsellCard } from "@/components/shared/UpsellCard"
import { UpsellBadge } from "@/components/shared/UpsellBadge"
import { useCurrentClient } from "@/lib/hooks/use-current-client"
import type { ScriptIntelligenceResult } from "@/lib/mocks/data/script-intelligence"

interface Script {
  id: string
  name: string
  description: string
  rubric_id: string
}

interface Objection {
  objection: string
  frequency: string
  bestResponse: string
  worstResponse: string
}

interface InsightsResult {
  metrics: {
    total: number
    closed: number
    notClosed: number
    partial: number
    closeRate: number
  }
  successPatterns: string[]
  failurePatterns: string[]
  partialPatterns: string[]
  dos: string[]
  donts: string[]
  commonObjections: Objection[]
  preCallChecklist: string[]
  suggestedScript: string
  keyDifferences: string[]
  trainers: { name: string; email: string }[]
}

// ── ScriptIntelligence sub-components ────────────────────────────────────────

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
          title={`${s.name}: ${s.score}/100`}
          style={{ flex: 1, background: colors[s.id] ?? "var(--am-muted)" }}
        />
      ))}
    </div>
  )
}

function StatusBadge({ status, t }: { status: "strong" | "weak" | "missing"; t: ReturnType<typeof useTranslations> }) {
  if (status === "strong") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
        style={{ background: "rgba(34,217,160,0.15)", color: "var(--am-green)" }}
      >
        ✓ {t("sectionAnalysis.strong")}
      </span>
    )
  }
  if (status === "weak") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
        style={{ background: "rgba(255,171,46,0.15)", color: "var(--am-amber)" }}
      >
        ⚠ {t("sectionAnalysis.weak")}
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: "rgba(255,94,94,0.15)", color: "var(--am-red)" }}
    >
      ✕ {t("sectionAnalysis.missing")}
    </span>
  )
}

function scoreColor(score: number) {
  if (score >= 75) return "var(--am-green)"
  if (score >= 65) return "var(--am-amber)"
  return "var(--am-red)"
}

function ScorePill({ score }: { score: number }) {
  return (
    <span className="text-sm font-bold font-mono" style={{ color: scoreColor(score) }}>
      {score}/100
    </span>
  )
}

function SectionScoreBar({ score }: { score: number }) {
  return (
    <div className="w-full rounded-full h-1.5" style={{ background: "var(--am-bg4)" }}>
      <div
        className="h-1.5 rounded-full transition-all"
        style={{ width: `${score}%`, background: scoreColor(score) }}
      />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const t = useTranslations("Dashboard.insights")
  const tMetrics = useTranslations("Dashboard.insights.metrics")
  const tErrors = useTranslations("Dashboard.insights.errors")
  const tSuggested = useTranslations("Dashboard.insights.suggestedScript")
  const tShare = useTranslations("Dashboard.insights.shareWithTeam")
  const tFreq = useTranslations("Dashboard.insights.objections.frequency")
  const tUpsell = useTranslations("Shared.upsell.insightsRag")
  const locale = useLocale()

  const [scripts, setScripts] = useState<Script[]>([])
  const [selectedScript, setSelectedScript] = useState("")
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [savingScript, setSavingScript] = useState(false)
  const [savedScript, setSavedScript] = useState(false)
  const [scriptResult, setScriptResult] = useState<ScriptIntelligenceResult | null>(null)
  const [insights, setInsights] = useState<InsightsResult | null>(null)
  const [error, setError] = useState("")

  const { client: currentClient, loading: clientLoading } = useCurrentClient()
  const showRagUpsell = !clientLoading && !!currentClient && !currentClient.plan.hasRag
  const canBuildScripts = !!currentClient?.plan.hasTwilio
  const showSaveScriptUpsell = !clientLoading && !canBuildScripts

  useEffect(() => {
    async function loadScripts() {
      const res = await fetch("/api/scripts?active=true")
      const { data } = (await res.json()) as { data: Script[] | null; error: unknown }
      if (data) setScripts(data)
      setLoading(false)
    }
    loadScripts()
  }, [])

  // Re-fetch when locale changes while results are on screen
  useEffect(() => {
    if (!insights || !selectedScript || analyzing) return
    void handleGenerateInsights()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale])

  async function handleAnalyze() {
    if (!selectedScript) return
    setAnalyzing(true)
    setError("")
    setScriptResult(null)
    try {
      const res = await fetch("/api/script-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: selectedScript }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error?.message || t("errors.generateFailed"))
      setScriptResult(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.unknown"))
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleGenerateInsights() {
    if (!selectedScript) return
    setAnalyzing(true)
    setError("")
    setInsights(null)
    setSent(false)
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-locale": locale },
        body: JSON.stringify({ scriptId: selectedScript }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error?.message || tErrors("generateFailed"))
      setInsights(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : tErrors("unknown"))
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleSaveAsNewScript() {
    if (!insights || !selectedScript) return
    setSavingScript(true)
    setError("")
    try {
      const originalScript = scripts.find((s) => s.id === selectedScript)
      const newName = `${originalScript?.name || tSuggested("defaultScriptName")} ${tSuggested("aiOptimizedSuffix")}`
      const lines = insights.suggestedScript.split("\n").filter((l) => l.trim())
      const sections: { name: string; instructions: string; tips: string }[] = []
      let currentSection: { name: string; instructions: string; tips: string } | null = null
      for (const line of lines) {
        const sectionMatch = line.match(/^\d+[\.\)]\s*(.+?)[:|-](.*)/)
        if (sectionMatch) {
          if (currentSection) sections.push(currentSection)
          currentSection = { name: sectionMatch[1].trim(), instructions: sectionMatch[2]?.trim() || "", tips: "" }
        } else if (currentSection) {
          currentSection.instructions += " " + line.trim()
        }
      }
      if (currentSection) sections.push(currentSection)
      if (sections.length === 0) {
        sections.push({ name: tSuggested("aiOptimizedSectionName"), instructions: insights.suggestedScript, tips: "" })
      }
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          description: tSuggested("descriptionTemplate", {
            total: insights.metrics.total,
            closeRate: insights.metrics.closeRate,
          }),
          rubric_id: originalScript?.rubric_id,
          sections,
          full_script: insights.suggestedScript,
          is_active: true,
        }),
      })
      const { error: insertError } = await res.json()
      if (insertError) throw new Error(insertError.message)
      setSavedScript(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : tErrors("saveFailed"))
    } finally {
      setSavingScript(false)
    }
  }

  async function handleSendToTeam() {
    if (!insights) return
    setSending(true)
    setError("")
    try {
      const script = scripts.find((s) => s.id === selectedScript)
      const res = await fetch("/api/send-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptName: script?.name || tShare("defaultScriptName"), insights }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || tErrors("sendFailed"))
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : tErrors("unknown"))
    } finally {
      setSending(false)
    }
  }

  function frequencyLabel(freq: string): string {
    if (freq === "Very Common") return tFreq("veryCommon")
    if (freq === "Common") return tFreq("common")
    if (freq === "Rare") return tFreq("rare")
    return freq
  }

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
          {t("subtitle", { count: scriptResult?.totalCalls ?? insights?.metrics.total ?? 0 })}
        </p>
      </div>

      {showRagUpsell && (
        <UpsellCard
          requires="pro_rag"
          title={tUpsell("title")}
          description={tUpsell("description")}
        />
      )}

      {/* Script selector — shared entry point for both engines */}
      <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: "var(--am-text)" }}>
            <Brain className="h-5 w-5" />
            {t("generateCardTitle")}
          </CardTitle>
          <CardDescription style={{ color: "var(--am-muted)" }}>
            {t("generateCardDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label style={{ color: "var(--am-muted)" }}>{t("selectScriptLabel")}</Label>
            <select
              value={selectedScript}
              onChange={(e) => {
                setSelectedScript(e.target.value)
                setScriptResult(null)
                setInsights(null)
                setSent(false)
                setSavedScript(false)
              }}
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ background: "var(--am-bg3)", border: "1px solid var(--am-bg4)", color: "var(--am-text)" }}
            >
              <option value="">{t("chooseScriptPlaceholder")}</option>
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleAnalyze}
              disabled={!selectedScript || analyzing}
              style={{ background: "var(--am-accent)", color: "#fff" }}
            >
              {analyzing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("analyzing")}</>
              ) : scriptResult ? (
                <><RefreshCw className="mr-2 h-4 w-4" />{t("generateButton")}</>
              ) : (
                <><Brain className="mr-2 h-4 w-4" />{t("generateButton")}</>
              )}
            </Button>
            <Button
              onClick={handleGenerateInsights}
              disabled={!selectedScript || analyzing}
              variant="outline"
              style={{ borderColor: "var(--am-bg4)", color: "var(--am-text)" }}
            >
              {analyzing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("analyzing")}</>
              ) : (
                <><BarChart3 className="mr-2 h-4 w-4" />{t("generateInsightsButton", { defaultValue: "Team Insights" })}</>
              )}
            </Button>
          </div>
          {error && (
            <div className="p-3 rounded-md text-sm" style={{ background: "rgba(255,94,94,0.1)", color: "var(--am-red)", border: "1px solid rgba(255,94,94,0.2)" }}>
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── ScriptIntelligence results ──────────────────────────────────────── */}
      {scriptResult && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold" style={{ color: "var(--am-text)" }}>
              {t("playbook.title")}
            </h2>
            <div className="flex gap-2">
              <Badge variant="outline" style={{ borderColor: "var(--am-bg4)", color: "var(--am-muted)" }}>
                {t("playbook.dogTrainingVertical")}
              </Badge>
              <Badge variant="outline" style={{ borderColor: "var(--am-bg4)", color: "var(--am-muted)" }}>
                {t("playbook.basedOnCalls", { count: scriptResult.totalCalls })}
              </Badge>
            </div>
          </div>

          {/* Playbook health */}
          <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
            <CardContent className="pt-5">
              <div className="flex flex-col md:flex-row gap-6 md:items-center">
                <div className="shrink-0">
                  <p className="text-xs mb-1" style={{ color: "var(--am-muted)" }}>{t("playbook.healthScore")}</p>
                  <p className="font-bold">
                    <span className="text-4xl font-mono" style={{ color: scoreColor(scriptResult.healthScore) }}>
                      {scriptResult.healthScore}
                    </span>
                    <span className="text-xl ml-0.5" style={{ color: "var(--am-muted)" }}>/100</span>
                  </p>
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium" style={{ color: "var(--am-muted)" }}>
                    {t(`playbook.effectiveness.${scriptResult.effectivenessLabel}`)}
                  </p>
                  <SectionBar sections={scriptResult.sections} />
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {scriptResult.sections.map((s) => (
                      <span key={s.id} className="text-xs font-mono" style={{ color: s.score < 65 ? "var(--am-red)" : s.score < 75 ? "var(--am-amber)" : "var(--am-muted)" }}>
                        {s.name}: {s.score}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="md:max-w-[260px] text-sm" style={{ color: "var(--am-muted)" }}>
                  {scriptResult.revenueLeak}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section analysis + AI suggestions */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--am-muted)" }}>
                  {t("sectionAnalysis.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {scriptResult.sections.map((section) => (
                  <div key={section.id} className="space-y-2 pb-5 last:pb-0 border-b last:border-0" style={{ borderColor: "var(--am-bg4)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-sm" style={{ color: "var(--am-text)" }}>{section.name}</span>
                      <ScorePill score={section.score} />
                    </div>
                    <SectionScoreBar score={section.score} />
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
                      <p className="text-sm italic pl-3 border-l-2" style={{ borderColor: "var(--am-red)", color: "var(--am-red)" }}>
                        [No script for this section]
                      </p>
                    )}
                    <p className="text-xs" style={{ color: "var(--am-muted)" }}>{section.usageStat}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--am-muted)" }}>
                  {t("aiSuggestions.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {scriptResult.suggestions.map((s, i) => (
                  <div key={i} className="space-y-2 pb-6 last:pb-0 border-b last:border-0" style={{ borderColor: "var(--am-bg4)" }}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm" style={{ color: "var(--am-text)" }}>{s.sectionName}</span>
                      {s.action === "rewrite" ? (
                        <Badge variant="outline" className="text-xs" style={{ borderColor: "var(--am-accent)", color: "var(--am-accent2)" }}>
                          {t("aiSuggestions.rewrite")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs" style={{ borderColor: "var(--am-green)", color: "var(--am-green)" }}>
                          <Plus className="h-3 w-3 mr-1" />
                          {t("aiSuggestions.addToScript")}
                        </Badge>
                      )}
                    </div>
                    {s.originalQuote && (
                      <p className="text-sm italic" style={{ color: "var(--am-muted)" }}>{s.originalQuote}</p>
                    )}
                    <p className="text-xs font-medium" style={{ color: "var(--am-muted)" }}>{t("aiSuggestions.suggestedRewrite")}</p>
                    <blockquote className="text-sm italic p-3 rounded-md" style={{ background: "rgba(34,217,160,0.08)", color: "var(--am-green)", border: "1px solid rgba(34,217,160,0.2)" }}>
                      {s.suggestedQuote}
                    </blockquote>
                    <p className="text-xs" style={{ color: "var(--am-muted)" }}>{s.rationale}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Top closer phrases */}
          <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--am-muted)" }}>
                What top closers say differently — phrases that predict closes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {scriptResult.topCloserPhrases.map((phrase, i) => (
                  <div key={i} className="rounded-lg p-4 space-y-2" style={{ background: "var(--am-bg3)", border: "1px solid var(--am-bg4)" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium" style={{ color: "var(--am-muted)" }}>{phrase.section}</span>
                      <span className="text-xs font-semibold" style={{ color: "var(--am-green)" }}>
                        {phrase.uplift} {phrase.upliftType === "close" ? "close rate" : "show rate"}
                      </span>
                    </div>
                    <p className="text-sm italic" style={{ color: "var(--am-text)" }}>{phrase.quote}</p>
                    <button className="text-xs font-medium hover:underline" style={{ color: "var(--am-accent2)" }}>
                      Add to script →
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Team Insights results ───────────────────────────────────────────── */}
      {insights && (
        <div className="space-y-6">
          {/* Metrics overview */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2" style={{ background: "var(--am-bg3)" }}>
                    <BarChart3 className="h-5 w-5" style={{ color: "var(--am-text)" }} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ color: "var(--am-text)" }}>{insights.metrics.total}</p>
                    <p className="text-xs" style={{ color: "var(--am-muted)" }}>{tMetrics("totalCalls")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2" style={{ background: "rgba(34,217,160,0.12)" }}>
                    <CheckCircle2 className="h-5 w-5" style={{ color: "var(--am-green)" }} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ color: "var(--am-green)" }}>{insights.metrics.closed}</p>
                    <p className="text-xs" style={{ color: "var(--am-muted)" }}>{tMetrics("closed")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2" style={{ background: "rgba(255,94,94,0.12)" }}>
                    <XCircle className="h-5 w-5" style={{ color: "var(--am-red)" }} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ color: "var(--am-red)" }}>{insights.metrics.notClosed}</p>
                    <p className="text-xs" style={{ color: "var(--am-muted)" }}>{tMetrics("notClosed")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2" style={{ background: "rgba(255,171,46,0.12)" }}>
                    <AlertTriangle className="h-5 w-5" style={{ color: "var(--am-amber)" }} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ color: "var(--am-amber)" }}>{insights.metrics.partial}</p>
                    <p className="text-xs" style={{ color: "var(--am-muted)" }}>{tMetrics("partial")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Close rate banner */}
          <Card style={{ background: "var(--am-bg2)", borderColor: insights.metrics.closeRate >= 60 ? "rgba(34,217,160,0.3)" : "rgba(255,94,94,0.3)" }}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: "var(--am-muted)" }}>{tMetrics("teamCloseRate")}</p>
                  <p className="text-4xl font-bold font-mono" style={{ color: insights.metrics.closeRate >= 60 ? "var(--am-green)" : "var(--am-red)" }}>
                    {insights.metrics.closeRate}%
                  </p>
                </div>
                <div className="rounded-full p-4" style={{ background: insights.metrics.closeRate >= 60 ? "rgba(34,217,160,0.12)" : "rgba(255,94,94,0.12)" }}>
                  {insights.metrics.closeRate >= 60
                    ? <TrendingUp className="h-8 w-8" style={{ color: "var(--am-green)" }} />
                    : <TrendingDown className="h-8 w-8" style={{ color: "var(--am-red)" }} />
                  }
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Patterns grid */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card style={{ background: "var(--am-bg2)", borderColor: "rgba(34,217,160,0.25)" }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: "var(--am-green)" }}>
                  <TrendingUp className="h-5 w-5" />
                  {t("whatClosersDo.title")}
                </CardTitle>
                <CardDescription style={{ color: "var(--am-muted)" }}>
                  {insights.metrics.closed === 1
                    ? t("whatClosersDo.subtitleOne", { count: insights.metrics.closed })
                    : t("whatClosersDo.subtitleOther", { count: insights.metrics.closed })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {insights.successPatterns.map((pattern, i) => (
                    <li key={i} className="flex gap-3">
                      <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--am-green)" }} />
                      <span className="text-sm" style={{ color: "var(--am-text)" }}>{pattern}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card style={{ background: "var(--am-bg2)", borderColor: "rgba(255,94,94,0.25)" }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: "var(--am-red)" }}>
                  <TrendingDown className="h-5 w-5" />
                  {t("whatLosesDeals.title")}
                </CardTitle>
                <CardDescription style={{ color: "var(--am-muted)" }}>
                  {insights.metrics.notClosed === 1
                    ? t("whatLosesDeals.subtitleOne", { count: insights.metrics.notClosed })
                    : t("whatLosesDeals.subtitleOther", { count: insights.metrics.notClosed })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {insights.failurePatterns.map((pattern, i) => (
                    <li key={i} className="flex gap-3">
                      <XCircle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--am-red)" }} />
                      <span className="text-sm" style={{ color: "var(--am-text)" }}>{pattern}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Do's and Don'ts */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card style={{ background: "rgba(34,217,160,0.05)", borderColor: "rgba(34,217,160,0.3)" }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: "var(--am-green)" }}>
                  <ThumbsUp className="h-5 w-5" />
                  {t("dos.title")}
                </CardTitle>
                <CardDescription style={{ color: "rgba(34,217,160,0.6)" }}>{t("dos.subtitle")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {insights.dos?.map((item, i) => (
                    <li key={i} className="flex gap-3 p-2 rounded-lg" style={{ background: "rgba(34,217,160,0.08)", border: "1px solid rgba(34,217,160,0.2)" }}>
                      <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--am-green)" }} />
                      <span className="text-sm" style={{ color: "var(--am-text)" }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card style={{ background: "rgba(255,94,94,0.05)", borderColor: "rgba(255,94,94,0.3)" }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: "var(--am-red)" }}>
                  <ThumbsDown className="h-5 w-5" />
                  {t("donts.title")}
                </CardTitle>
                <CardDescription style={{ color: "rgba(255,94,94,0.6)" }}>{t("donts.subtitle")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {insights.donts?.map((item, i) => (
                    <li key={i} className="flex gap-3 p-2 rounded-lg" style={{ background: "rgba(255,94,94,0.08)", border: "1px solid rgba(255,94,94,0.2)" }}>
                      <XCircle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--am-red)" }} />
                      <span className="text-sm" style={{ color: "var(--am-text)" }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Common Objections */}
          <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2" style={{ color: "var(--am-text)" }}>
                <MessageSquareWarning className="h-5 w-5" />
                {t("objections.title")}
              </CardTitle>
              <CardDescription style={{ color: "var(--am-muted)" }}>{t("objections.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {insights.commonObjections?.map((obj, i) => (
                <div key={i} className="rounded-lg p-4 space-y-3" style={{ background: "var(--am-bg3)", border: "1px solid var(--am-bg4)" }}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm" style={{ color: "var(--am-text)" }}>&quot;{obj.objection}&quot;</span>
                    <Badge variant={obj.frequency === "Very Common" ? "destructive" : obj.frequency === "Common" ? "default" : "secondary"} className="text-xs">
                      {frequencyLabel(obj.frequency)}
                    </Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="p-3 rounded-md" style={{ background: "rgba(34,217,160,0.08)", border: "1px solid rgba(34,217,160,0.2)" }}>
                      <p className="text-xs font-semibold mb-1 flex items-center gap-1" style={{ color: "var(--am-green)" }}>
                        <CheckCircle2 className="h-3 w-3" /> {t("objections.bestResponse")}
                      </p>
                      <p className="text-sm" style={{ color: "var(--am-text)" }}>{obj.bestResponse}</p>
                    </div>
                    <div className="p-3 rounded-md" style={{ background: "rgba(255,94,94,0.08)", border: "1px solid rgba(255,94,94,0.2)" }}>
                      <p className="text-xs font-semibold mb-1 flex items-center gap-1" style={{ color: "var(--am-red)" }}>
                        <XCircle className="h-3 w-3" /> {t("objections.worstResponse")}
                      </p>
                      <p className="text-sm" style={{ color: "var(--am-text)" }}>{obj.worstResponse}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Key Differences */}
          <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2" style={{ color: "var(--am-text)" }}>
                <Lightbulb className="h-5 w-5" />
                {t("keyDifferences.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {insights.keyDifferences.map((diff, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "var(--am-accent)", color: "#fff" }}>
                      {i + 1}
                    </span>
                    <span className="text-sm" style={{ color: "var(--am-text)" }}>{diff}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Pre-Call Checklist */}
          <Card style={{ background: "var(--am-bg2)", borderColor: "rgba(110,86,255,0.3)" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2" style={{ color: "var(--am-text)" }}>
                <CheckCircle2 className="h-5 w-5" style={{ color: "var(--am-accent)" }} />
                {t("preCallChecklist.title")}
              </CardTitle>
              <CardDescription style={{ color: "var(--am-muted)" }}>{t("preCallChecklist.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {insights.preCallChecklist.map((item, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-lg" style={{ background: "var(--am-bg3)", border: "1px solid var(--am-bg4)" }}>
                    <div className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-bold" style={{ background: "var(--am-accent)", color: "#fff" }}>
                      {i + 1}
                    </div>
                    <span className="text-sm" style={{ color: "var(--am-text)" }}>{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Suggested Script */}
          <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2" style={{ color: "var(--am-text)" }}>
                <FileText className="h-5 w-5" />
                {tSuggested("title")}
              </CardTitle>
              <CardDescription style={{ color: "var(--am-muted)" }}>{tSuggested("subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg p-4 text-sm whitespace-pre-wrap max-h-96 overflow-y-auto" style={{ background: "var(--am-bg3)", border: "1px solid var(--am-bg4)", color: "var(--am-text)" }}>
                {insights.suggestedScript}
              </div>
              {savedScript ? (
                <div className="flex items-center gap-2 p-3 rounded-md" style={{ background: "rgba(34,217,160,0.1)", border: "1px solid rgba(34,217,160,0.2)", color: "var(--am-green)" }}>
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="text-sm">{tSuggested("savedMessage")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    onClick={handleSaveAsNewScript}
                    disabled={savingScript || !canBuildScripts}
                    variant="outline"
                    size="lg"
                    className="w-full"
                    style={{ borderColor: "var(--am-bg4)", color: "var(--am-text)" }}
                    title={!canBuildScripts ? "Available on Pro and Pro + RAG" : undefined}
                  >
                    {savingScript ? (
                      <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{tSuggested("saving")}</>
                    ) : (
                      <span className="flex items-center justify-center gap-2 w-full">
                        <Save className="h-5 w-5" />
                        {tSuggested("saveButton")}
                        {showSaveScriptUpsell && <UpsellBadge requires="pro" compact />}
                      </span>
                    )}
                  </Button>
                  {!canBuildScripts && (
                    <p className="text-xs" style={{ color: "var(--am-muted)" }}>
                      Auto-script generation is part of Pro and Pro + RAG. Starter still lets you create scripts manually in <span className="font-medium">Settings → Rubric</span>.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Send to Team */}
          <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2" style={{ color: "var(--am-text)" }}>
                <Users className="h-5 w-5" />
                {tShare("title")}
              </CardTitle>
              <CardDescription style={{ color: "var(--am-muted)" }}>
                {insights.trainers.length === 1
                  ? tShare("subtitleOne", { count: insights.trainers.length })
                  : tShare("subtitleOther", { count: insights.trainers.length })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {insights.trainers.map((trainer, i) => (
                  <Badge key={i} variant="secondary">
                    {trainer.name} ({trainer.email})
                  </Badge>
                ))}
              </div>
              {sent ? (
                <div className="flex items-center gap-2 p-3 rounded-md" style={{ background: "rgba(34,217,160,0.1)", border: "1px solid rgba(34,217,160,0.2)", color: "var(--am-green)" }}>
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="text-sm">{tShare("sentMessage")}</p>
                </div>
              ) : (
                <Button
                  onClick={handleSendToTeam}
                  disabled={sending}
                  size="lg"
                  className="w-full"
                  style={{ background: "var(--am-accent)", color: "#fff" }}
                >
                  {sending ? (
                    <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{tShare("sending")}</>
                  ) : (
                    <><Send className="mr-2 h-5 w-5" />{tShare("sendButton")}</>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
