"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Brain,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react"
import { UpsellCard } from "@/components/shared/UpsellCard"
import { useCurrentClient } from "@/lib/hooks/use-current-client"
import { scoreColorVar, scoreLevel, toBarWidth, toDisplay5 } from "@/lib/score-display"
import type { ScriptIntelligenceResult } from "@/lib/mocks/data/script-intelligence"

interface Script {
  id: string
  name: string
  description: string
  rubric_id: string
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

function ScorePill({ score }: { score: number }) {
  return (
    <span className="text-sm font-bold font-mono" style={{ color: scoreColorVar(score) }}>
      {toDisplay5(score)}/5
    </span>
  )
}

function SectionScoreBar({ score }: { score: number }) {
  return (
    <div className="w-full rounded-full h-1.5" style={{ background: "var(--am-bg4)" }}>
      <div
        className="h-1.5 rounded-full transition-all"
        style={{ width: `${toBarWidth(score)}%`, background: scoreColorVar(score) }}
      />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const t = useTranslations("Dashboard.insights")
  const tUpsell = useTranslations("Shared.upsell.insightsRag")

  const [scripts, setScripts] = useState<Script[]>([])
  const [selectedScript, setSelectedScript] = useState("")
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [scriptResult, setScriptResult] = useState<ScriptIntelligenceResult | null>(null)
  const [error, setError] = useState("")

  const { client: currentClient, loading: clientLoading } = useCurrentClient()
  const showRagUpsell = !clientLoading && !!currentClient && !currentClient.plan.hasRag

  useEffect(() => {
    async function loadScripts() {
      // Script Intelligence é uma tela analítica — owner deve poder auditar
      // qualquer script da org, inclusive arquivados (`is_active=false`).
      // Filtrar por active=true zerava o dropdown de orgs cujos scripts foram
      // criados via Settings (que defaulta is_active=false) sem nunca ativar.
      // O ordering org-scoped (is_active DESC) mantém o ativo no topo.
      const res = await fetch("/api/scripts")
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
          {t("subtitle", { count: scriptResult?.totalCalls ?? 0 })}
        </p>
      </div>

      {showRagUpsell && (
        <UpsellCard
          requires="pro_rag"
          title={tUpsell("title")}
          description={tUpsell("description")}
        />
      )}

      {/* Script selector */}
      <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: "var(--am-text)" }}>
            <Brain className="h-5 w-5" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label style={{ color: "var(--am-muted)" }}>{t("selectScriptLabel")}</Label>
            <select
              value={selectedScript}
              onChange={(e) => {
                setSelectedScript(e.target.value)
                setScriptResult(null)
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
          {error && (
            <div className="p-3 rounded-md text-sm" style={{ background: "rgba(255,94,94,0.1)", color: "var(--am-red)", border: "1px solid rgba(255,94,94,0.2)" }}>
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
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

          {/* Health score */}
          <Card style={{ background: "var(--am-bg2)", borderColor: "var(--am-bg4)" }}>
            <CardContent className="pt-5">
              <div className="flex flex-col md:flex-row gap-6 md:items-center">
                <div className="shrink-0">
                  <p className="text-xs mb-1" style={{ color: "var(--am-muted)" }}>{t("playbook.healthScore")}</p>
                  <p className="font-bold">
                    <span className="text-4xl font-mono" style={{ color: scoreColorVar(scriptResult.healthScore) }}>
                      {toDisplay5(scriptResult.healthScore)}
                    </span>
                    <span className="text-xl ml-0.5" style={{ color: "var(--am-muted)" }}>/5</span>
                  </p>
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium" style={{ color: "var(--am-muted)" }}>
                    {t(`playbook.effectiveness.${scriptResult.effectivenessLabel}`)}
                  </p>
                  <SectionBar sections={scriptResult.sections} />
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {scriptResult.sections.map((s) => (
                      <span key={s.id} className="text-xs font-mono" style={{ color: scoreLevel(s.score) === 'low' ? "var(--am-red)" : scoreLevel(s.score) === 'mid' ? "var(--am-amber)" : "var(--am-muted)" }}>
                        {s.name}: {toDisplay5(s.score)}
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

        </div>
      )}
    </div>
  )
}
