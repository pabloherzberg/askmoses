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

export default function InsightsPage() {
  const t = useTranslations("Dashboard.insights")
  const tMetrics = useTranslations("Dashboard.insights.metrics")
  const tErrors = useTranslations("Dashboard.insights.errors")
  const tSuggested = useTranslations("Dashboard.insights.suggestedScript")
  const tShare = useTranslations("Dashboard.insights.shareWithTeam")
  const tFreq = useTranslations("Dashboard.insights.objections.frequency")
  const locale = useLocale()
  const [scripts, setScripts] = useState<Script[]>([])
  const [selectedScript, setSelectedScript] = useState("")
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [savingScript, setSavingScript] = useState(false)
  const [savedScript, setSavedScript] = useState(false)
  const [insights, setInsights] = useState<InsightsResult | null>(null)
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

  // Re-fetch insights whenever the user switches language while results are
  // already on screen. Coaching content is re-translated on each language change
  // without any client-side cache, per product decision.
  useEffect(() => {
    if (!insights || !selectedScript || analyzing) return
    void handleGenerateInsights()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale])

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
      if (!res.ok || json.error) {
        throw new Error(json.error?.message || tErrors('generateFailed'))
      }

      setInsights(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : tErrors('unknown'))
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
      const newName = `${originalScript?.name || tSuggested('defaultScriptName')} ${tSuggested('aiOptimizedSuffix')}`

      // Parse suggested script into sections
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

      // If parsing failed, create a single section
      if (sections.length === 0) {
        sections.push({ name: tSuggested('aiOptimizedSectionName'), instructions: insights.suggestedScript, tips: "" })
      }

      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          description: tSuggested('descriptionTemplate', {
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
      setError(err instanceof Error ? err.message : tErrors('saveFailed'))
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
        body: JSON.stringify({
          scriptName: script?.name || tShare('defaultScriptName'),
          insights,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || tErrors('sendFailed'))
      }

      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : tErrors('unknown'))
    } finally {
      setSending(false)
    }
  }

  function frequencyLabel(freq: string): string {
    if (freq === "Very Common") return tFreq('veryCommon')
    if (freq === "Common") return tFreq('common')
    if (freq === "Rare") return tFreq('rare')
    return freq
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      {/* Script Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            {t('generateCardTitle')}
          </CardTitle>
          <CardDescription>
            {t('generateCardDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('selectScriptLabel')}</Label>
            <select
              value={selectedScript}
              onChange={(e) => {
                setSelectedScript(e.target.value)
                setInsights(null)
                setSent(false)
                setSavedScript(false)
              }}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            >
              <option value="">{t('chooseScriptPlaceholder')}</option>
              {scripts.map((script) => (
                <option key={script.id} value={script.id}>
                  {script.name}
                </option>
              ))}
            </select>
          </div>

          <Button
            onClick={handleGenerateInsights}
            disabled={!selectedScript || analyzing}
            className="w-full"
            size="lg"
          >
            {analyzing ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t('analyzing')}
              </>
            ) : (
              <>
                <Brain className="mr-2 h-5 w-5" />
                {t('generateButton')}
              </>
            )}
          </Button>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Insights Results */}
      {insights && (
        <div className="space-y-6">
          {/* Metrics Overview */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-muted p-2">
                    <BarChart3 className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{insights.metrics.total}</p>
                    <p className="text-xs text-muted-foreground">{tMetrics('totalCalls')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-green-100 dark:bg-green-900 p-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{insights.metrics.closed}</p>
                    <p className="text-xs text-muted-foreground">{tMetrics('closed')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-red-100 dark:bg-red-900 p-2">
                    <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{insights.metrics.notClosed}</p>
                    <p className="text-xs text-muted-foreground">{tMetrics('notClosed')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-amber-100 dark:bg-amber-900 p-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{insights.metrics.partial}</p>
                    <p className="text-xs text-muted-foreground">{tMetrics('partial')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Close Rate Banner */}
          <Card className={insights.metrics.closeRate >= 60 ? "border-green-200 dark:border-green-800" : "border-red-200 dark:border-red-800"}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{tMetrics('teamCloseRate')}</p>
                  <p className="text-4xl font-bold">{insights.metrics.closeRate}%</p>
                </div>
                <div className={`rounded-full p-4 ${insights.metrics.closeRate >= 60 ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900"}`}>
                  {insights.metrics.closeRate >= 60 ? (
                    <TrendingUp className="h-8 w-8 text-green-600 dark:text-green-400" />
                  ) : (
                    <TrendingDown className="h-8 w-8 text-red-600 dark:text-red-400" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Patterns Grid */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* What Works */}
            <Card className="border-green-200 dark:border-green-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                  <TrendingUp className="h-5 w-5" />
                  {t('whatClosersDo.title')}
                </CardTitle>
                <CardDescription>
                  {insights.metrics.closed === 1
                    ? t('whatClosersDo.subtitleOne', { count: insights.metrics.closed })
                    : t('whatClosersDo.subtitleOther', { count: insights.metrics.closed })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {insights.successPatterns.map((pattern, i) => (
                    <li key={i} className="flex gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-sm">{pattern}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* What Fails */}
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <TrendingDown className="h-5 w-5" />
                  {t('whatLosesDeals.title')}
                </CardTitle>
                <CardDescription>
                  {insights.metrics.notClosed === 1
                    ? t('whatLosesDeals.subtitleOne', { count: insights.metrics.notClosed })
                    : t('whatLosesDeals.subtitleOther', { count: insights.metrics.notClosed })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {insights.failurePatterns.map((pattern, i) => (
                    <li key={i} className="flex gap-3">
                      <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                      <span className="text-sm">{pattern}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Do's and Don'ts */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-green-700 dark:border-green-600 bg-green-950 dark:bg-green-950">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-300">
                  <ThumbsUp className="h-5 w-5" />
                  {t('dos.title')}
                </CardTitle>
                <CardDescription className="text-green-200/70">{t('dos.subtitle')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {insights.dos?.map((item, i) => (
                    <li key={i} className="flex gap-3 p-2 rounded-lg bg-green-900/40 border border-green-700/50">
                      <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                      <span className="text-sm text-green-100">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-red-700 dark:border-red-600 bg-red-950 dark:bg-red-950">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-300">
                  <ThumbsDown className="h-5 w-5" />
                  {t('donts.title')}
                </CardTitle>
                <CardDescription className="text-red-200/70">{t('donts.subtitle')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {insights.donts?.map((item, i) => (
                    <li key={i} className="flex gap-3 p-2 rounded-lg bg-red-900/40 border border-red-700/50">
                      <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                      <span className="text-sm text-red-100">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Common Objections */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareWarning className="h-5 w-5" />
                {t('objections.title')}
              </CardTitle>
              <CardDescription>
                {t('objections.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {insights.commonObjections?.map((obj, i) => (
                <div key={i} className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm text-foreground">&quot;{obj.objection}&quot;</span>
                        <Badge variant={
                          obj.frequency === "Very Common" ? "destructive" :
                          obj.frequency === "Common" ? "default" : "secondary"
                        } className="text-xs">
                          {frequencyLabel(obj.frequency)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 hover:border-green-400 dark:hover:border-green-600 transition-colors">
                      <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> {t('objections.bestResponse')}
                      </p>
                      <p className="text-sm text-green-900 dark:text-green-100">{obj.bestResponse}</p>
                    </div>
                    <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 hover:border-red-400 dark:hover:border-red-600 transition-colors">
                      <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1 flex items-center gap-1">
                        <XCircle className="h-3 w-3" /> {t('objections.worstResponse')}
                      </p>
                      <p className="text-sm text-red-900 dark:text-red-100">{obj.worstResponse}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Key Differences */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5" />
                {t('keyDifferences.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {insights.keyDifferences.map((diff, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </span>
                    <span className="text-sm">{diff}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Pre-Call Checklist */}
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                {t('preCallChecklist.title')}
              </CardTitle>
              <CardDescription>
                {t('preCallChecklist.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {insights.preCallChecklist.map((item, i) => (
                  <div
                    key={i}
                    className="flex gap-3 p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </div>
                    <span className="text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Suggested Script */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {tSuggested('title')}
              </CardTitle>
              <CardDescription>
                {tSuggested('subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
                {insights.suggestedScript}
              </div>

              {savedScript ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <p className="text-sm text-green-700 dark:text-green-300">{tSuggested('savedMessage')}</p>
                </div>
              ) : (
                <Button
                  onClick={handleSaveAsNewScript}
                  disabled={savingScript}
                  variant="outline"
                  size="lg"
                  className="w-full bg-transparent"
                >
                  {savingScript ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {tSuggested('saving')}
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-5 w-5" />
                      {tSuggested('saveButton')}
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Send to Team */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {tShare('title')}
              </CardTitle>
              <CardDescription>
                {insights.trainers.length === 1
                  ? tShare('subtitleOne', { count: insights.trainers.length })
                  : tShare('subtitleOther', { count: insights.trainers.length })}
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
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <p className="text-sm text-green-700 dark:text-green-300">{tShare('sentMessage')}</p>
                </div>
              ) : (
                <Button
                  onClick={handleSendToTeam}
                  disabled={sending}
                  size="lg"
                  className="w-full"
                >
                  {sending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {tShare('sending')}
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-5 w-5" />
                      {tShare('sendButton')}
                    </>
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
