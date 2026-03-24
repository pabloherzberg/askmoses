"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
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

interface CallData {
  id: string
  trainer_name: string
  trainer_email: string
  call_outcome: string
  transcript: string
  overall_score: number
  total_criteria: number
  created_at: string
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

  const supabase = useMemo(() => {
    return createClient()
  }, [])

  useEffect(() => {
    async function loadScripts() {
      const { data } = await supabase
        .from("scripts")
        .select("id, name, description, rubric_id")
        .eq("is_active", true)
        .order("created_at", { ascending: false })

      if (data) setScripts(data)
      setLoading(false)
    }
    loadScripts()
  }, [])

  async function handleGenerateInsights() {
    if (!selectedScript) return

    setAnalyzing(true)
    setError("")
    setInsights(null)
    setSent(false)

    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: selectedScript }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to generate insights")
      }

      const data = await res.json()
      setInsights(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
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
      const newName = `${originalScript?.name || "Script"} (AI Optimized)`

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
        sections.push({ name: "AI Optimized Script", instructions: insights.suggestedScript, tips: "" })
      }

      const { error: insertError } = await supabase
        .from("scripts")
        .insert({
          name: newName,
          description: `AI-generated optimized script based on analysis of ${insights.metrics.total} calls (${insights.metrics.closeRate}% close rate)`,
          rubric_id: originalScript?.rubric_id,
          sections,
          full_script: insights.suggestedScript,
          is_active: true,
        })

      if (insertError) throw new Error(insertError.message)

      setSavedScript(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save script")
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
          scriptName: script?.name || "Sales Script",
          insights,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to send insights")
      }

      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setSending(false)
    }
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
        <h1 className="text-2xl font-bold tracking-tight text-balance">Team Insights</h1>
        <p className="text-muted-foreground">
          AI-powered analysis of what works and what doesn't across your team's calls
        </p>
      </div>

      {/* Script Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Generate Insights
          </CardTitle>
          <CardDescription>
            Select a script to analyze all associated calls. The AI will find patterns
            in successful vs unsuccessful calls and generate actionable recommendations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Select Script</Label>
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
              <option value="">Choose a script to analyze...</option>
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
                Analyzing calls... This may take a moment
              </>
            ) : (
              <>
                <Brain className="mr-2 h-5 w-5" />
                Generate Insights
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
                    <p className="text-xs text-muted-foreground">Total Calls</p>
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
                    <p className="text-xs text-muted-foreground">Closed</p>
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
                    <p className="text-xs text-muted-foreground">Not Closed</p>
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
                    <p className="text-xs text-muted-foreground">Partial</p>
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
                  <p className="text-sm text-muted-foreground">Team Close Rate</p>
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
                  What Closers Do
                </CardTitle>
                <CardDescription>
                  Common patterns found in {insights.metrics.closed} successful calls
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
                  What Loses Deals
                </CardTitle>
                <CardDescription>
                  Common patterns found in {insights.metrics.notClosed} unsuccessful calls
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
                  DO's
                </CardTitle>
                <CardDescription className="text-green-200/70">Best practices from top closers</CardDescription>
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
                  DON'Ts
                </CardTitle>
                <CardDescription className="text-red-200/70">Behaviors that lose deals</CardDescription>
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
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-100">
                <MessageSquareWarning className="h-5 w-5" />
                Common Objections & How to Handle Them
              </CardTitle>
              <CardDescription className="text-slate-300">
                Objections found across all calls with best vs worst responses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {insights.commonObjections?.map((obj, i) => (
                <div key={i} className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm text-slate-100">"{obj.objection}"</span>
                        <Badge variant={
                          obj.frequency === "Very Common" ? "destructive" :
                          obj.frequency === "Common" ? "default" : "secondary"
                        } className="text-xs">
                          {obj.frequency}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="p-3 rounded-md bg-green-900/30 border border-green-700 hover:border-green-600 transition-colors">
                      <p className="text-xs font-semibold text-green-300 mb-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Best Response (Closers)
                      </p>
                      <p className="text-sm text-green-100">{obj.bestResponse}</p>
                    </div>
                    <div className="p-3 rounded-md bg-red-900/30 border border-red-700 hover:border-red-600 transition-colors">
                      <p className="text-xs font-semibold text-red-300 mb-1 flex items-center gap-1">
                        <XCircle className="h-3 w-3" /> Worst Response (Non-Closers)
                      </p>
                      <p className="text-sm text-red-100">{obj.worstResponse}</p>
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
                Key Differences Between Closers and Non-Closers
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
                Pre-Call Checklist
              </CardTitle>
              <CardDescription>
                Based on successful calls, every trainer should follow these steps before and during a call
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
                AI-Suggested Optimized Script
              </CardTitle>
              <CardDescription>
                Based on what works in successful calls, here is a suggested improved script
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
                {insights.suggestedScript}
              </div>
              
              {savedScript ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <p className="text-sm text-green-700 dark:text-green-300">Script saved! Check your Rubric settings to view it.</p>
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
                      Saving as new script...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-5 w-5" />
                      Save as New Script
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
                Share with Team
              </CardTitle>
              <CardDescription>
                Send this insights report as a weekly digest to all {insights.trainers.length} trainers
                who have calls for this script
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
                  <p className="text-sm text-green-700 dark:text-green-300">Insights sent to all team members!</p>
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
                      Sending to team...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-5 w-5" />
                      Send Insights to Team
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
