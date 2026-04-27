"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Brain, Loader2, Plus, RefreshCw } from "lucide-react"
import type { ScriptIntelligenceResult } from "@/lib/mocks/data/script-intelligence"

interface Script {
  id: string
  name: string
  description: string
  rubric_id: string
}

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

export default function InsightsPage() {
  const t = useTranslations("Dashboard.insights")
  const [scripts, setScripts] = useState<Script[]>([])
  const [selectedScript, setSelectedScript] = useState("")
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<ScriptIntelligenceResult | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    async function loadScripts() {
      const res = await fetch("/api/scripts?active=true")
      const { data } = (await res.json()) as { data: Script[] | null; error: unknown }
      if (data) setScripts(data)
      setLoading(false)
    }
    loadScripts()
  }, [])

  async function handleAnalyze() {
    if (!selectedScript) return
    setAnalyzing(true)
    setError("")
    setResult(null)
    try {
      const res = await fetch("/api/script-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: selectedScript }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error?.message || t("errors.generateFailed"))
      setResult(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.unknown"))
    } finally {
      setAnalyzing(false)
    }
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
          {t("subtitle", { count: result?.totalCalls ?? 0 })}
        </p>
      </div>

      {/* Script selector */}
      <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
        <CardContent className="pt-5 flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 space-y-1.5">
            <Label style={{ color: "var(--am-muted)" }}>{t("selectScriptLabel")}</Label>
            <select
              value={selectedScript}
              onChange={(e) => { setSelectedScript(e.target.value); setResult(null) }}
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ background: "var(--am-bg3)", border: "1px solid var(--am-bg4)", color: "var(--am-text)" }}
            >
              <option value="">{t("chooseScriptPlaceholder")}</option>
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <Button
            onClick={handleAnalyze}
            disabled={!selectedScript || analyzing}
            style={{ background: "var(--am-accent)", color: "#fff" }}
          >
            {analyzing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("analyzing")}</>
            ) : result ? (
              <><RefreshCw className="mr-2 h-4 w-4" />{t("generateButton")}</>
            ) : (
              <><Brain className="mr-2 h-4 w-4" />{t("generateButton")}</>
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="p-3 rounded-md text-sm" style={{ background: "rgba(255,94,94,0.1)", color: "var(--am-red)", border: "1px solid rgba(255,94,94,0.2)" }}>
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">

          {/* ── Playbook header row (fora do card, acima dele) ── */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold" style={{ color: "var(--am-text)" }}>
              {t("playbook.title")}
            </h2>
            <div className="flex gap-2">
              <Badge variant="outline" style={{ borderColor: "var(--am-bg4)", color: "var(--am-muted)" }}>
                {t("playbook.dogTrainingVertical")}
              </Badge>
              <Badge variant="outline" style={{ borderColor: "var(--am-bg4)", color: "var(--am-muted)" }}>
                {t("playbook.basedOnCalls", { count: result.totalCalls })}
              </Badge>
            </div>
          </div>

          {/* ── Playbook health card ── */}
          <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
            <CardContent className="pt-5">
              <div className="flex flex-col md:flex-row gap-6 md:items-center">
                {/* Health score */}
                <div className="shrink-0">
                  <p className="text-xs mb-1" style={{ color: "var(--am-muted)" }}>{t("playbook.healthScore")}</p>
                  <p className="font-bold">
                    <span className="text-4xl font-mono" style={{ color: scoreColor(result.healthScore) }}>
                      {result.healthScore}
                    </span>
                    <span className="text-xl ml-0.5" style={{ color: "var(--am-muted)" }}>/100</span>
                  </p>
                </div>

                {/* Section bar + labels */}
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium" style={{ color: "var(--am-muted)" }}>
                    {t(`playbook.effectiveness.${result.effectivenessLabel}`)}
                  </p>
                  <SectionBar sections={result.sections} />
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {result.sections.map((s) => (
                      <span key={s.id} className="text-xs font-mono" style={{ color: s.score < 65 ? "var(--am-red)" : s.score < 75 ? "var(--am-amber)" : "var(--am-muted)" }}>
                        {s.name}: {s.score}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Revenue leak */}
                <div className="md:max-w-[260px] text-sm" style={{ color: "var(--am-muted)" }}>
                  {result.revenueLeak}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Two-column: Section analysis + AI suggestions ── */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Section analysis */}
            <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--am-muted)" }}>
                  {t("sectionAnalysis.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {result.sections.map((section) => (
                  <div key={section.id} className="space-y-2 pb-5 last:pb-0 border-b last:border-0" style={{ borderColor: "var(--am-bg4)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-sm" style={{ color: "var(--am-text)" }}>
                        {section.name}
                      </span>
                      <ScorePill score={section.score} />
                    </div>
                    <SectionScoreBar score={section.score} />
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge status={section.status} t={t} />
                      {section.isMissingQuote && section.status !== "missing" && (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(255,94,94,0.15)", color: "var(--am-red)" }}
                        >
                          ✕ {t("sectionAnalysis.missing")}
                        </span>
                      )}
                    </div>
                    {section.quote && (
                      <blockquote
                        className="text-sm italic pl-3 border-l-2"
                        style={{ borderColor: section.status === "strong" ? "var(--am-green)" : "var(--am-red)", color: "var(--am-text)" }}
                      >
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

            {/* AI Improvement suggestions */}
            <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--am-muted)" }}>
                  {t("aiSuggestions.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {result.suggestions.map((s, i) => (
                  <div key={i} className="space-y-2 pb-6 last:pb-0 border-b last:border-0" style={{ borderColor: "var(--am-bg4)" }}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm" style={{ color: "var(--am-text)" }}>{s.sectionName}</span>
                      {s.action === "rewrite" ? (
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{ borderColor: "var(--am-accent)", color: "var(--am-accent2)" }}
                        >
                          {t("aiSuggestions.rewrite")}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{ borderColor: "var(--am-green)", color: "var(--am-green)" }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {t("aiSuggestions.addToScript")}
                        </Badge>
                      )}
                    </div>

                    {s.originalQuote && (
                      <p className="text-sm italic" style={{ color: "var(--am-muted)" }}>
                        {s.originalQuote}
                      </p>
                    )}

                    <p className="text-xs font-medium" style={{ color: "var(--am-muted)" }}>
                      {t("aiSuggestions.suggestedRewrite")}
                    </p>

                    {/* Suggested rewrite — verde */}
                    <blockquote
                      className="text-sm italic p-3 rounded-md"
                      style={{ background: "rgba(34,217,160,0.08)", color: "var(--am-green)", border: "1px solid rgba(34,217,160,0.2)" }}
                    >
                      {s.suggestedQuote}
                    </blockquote>

                    <p className="text-xs" style={{ color: "var(--am-muted)" }}>{s.rationale}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* ── What top closers say differently ── */}
          <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--am-muted)" }}>
                What top closers say differently — phrases that predict closes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {result.topCloserPhrases.map((phrase, i) => (
                  <div
                    key={i}
                    className="rounded-lg p-4 space-y-2"
                    style={{ background: "var(--am-bg3)", border: "1px solid var(--am-bg4)" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium" style={{ color: "var(--am-muted)" }}>
                        {phrase.section}
                      </span>
                      <span className="text-xs font-semibold" style={{ color: "var(--am-green)" }}>
                        {phrase.uplift} {phrase.upliftType === "close" ? "close rate" : "show rate"}
                      </span>
                    </div>
                    <p className="text-sm italic" style={{ color: "var(--am-text)" }}>
                      {phrase.quote}
                    </p>
                    <button
                      className="text-xs font-medium hover:underline"
                      style={{ color: "var(--am-accent2)" }}
                    >
                      Add to script →
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  )
}
