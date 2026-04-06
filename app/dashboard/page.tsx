"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import type { Call } from "@/lib/types"
import { RESULT_STYLES, DEFAULT_RESULT_STYLE } from "@/lib/constants"
import {
  Upload,
  Phone,
  CheckCircle,
  XCircle,
  TrendingUp,
  Clock,
  Loader2,
} from "lucide-react"

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalCalls: 0,
    passRate: "-",
    avgScore: "-",
    thisWeekCalls: 0,
  })
  const [recentCalls, setRecentCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      setLoading(true)

      const res = await fetch("/api/calls")
      const { data: callsData, error } = (await res.json()) as {
        data: Call[] | null
        error: unknown
      }

      if (error || !callsData) {
        setLoading(false)
        return
      }

      const sorted = [...callsData].sort((a, b) => b.date.localeCompare(a.date))

      const totalCalls = sorted.length
      const avgScore = totalCalls > 0
        ? (sorted.reduce((sum, c) => sum + c.score, 0) / totalCalls).toFixed(1)
        : "-"
      const passed = sorted.filter((c) => c.score >= 75).length
      const passRate = totalCalls > 0 ? `${Math.round((passed / totalCalls) * 100)}%` : "-"

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const thisWeekCalls = sorted.filter((c) => c.date >= weekAgo).length

      setStats({
        totalCalls,
        passRate,
        avgScore: avgScore === "-" ? "-" : `${avgScore}/100`,
        thisWeekCalls,
      })
      setRecentCalls(sorted.slice(0, 5))
      setLoading(false)
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-16 lg:pb-0">
      {/* Quick Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
          <p className="text-muted-foreground">
            Upload a call to get AI coaching feedback
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/upload">
            <Upload className="mr-2 h-4 w-4" />
            Upload Call
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Calls
            </CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCalls}</div>
            <p className="text-xs text-muted-foreground">Calls analyzed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pass Rate
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.passRate}</div>
            <p className="text-xs text-muted-foreground">Score ≥ 75</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg. Score
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgScore}</div>
            <p className="text-xs text-muted-foreground">Per call</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Week
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.thisWeekCalls}</div>
            <p className="text-xs text-muted-foreground">Calls processed</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Calls */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Calls</CardTitle>
        </CardHeader>
        <CardContent>
          {recentCalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Phone className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No calls yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload your first call to get started with AI coaching
              </p>
              <Button asChild className="mt-4">
                <Link href="/dashboard/upload">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Call
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {recentCalls.map((call) => {
                const isPassed = call.score >= 75
                const result = RESULT_STYLES[call.result] ?? DEFAULT_RESULT_STYLE
                return (
                  <div
                    key={call.id}
                    className="flex items-center justify-between rounded-lg border border-border p-4"
                  >
                    <div className="flex items-center gap-4">
                      {isPassed ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <p className="font-medium">{call.trainerName}</p>
                        <p className="text-sm text-muted-foreground">{call.prospect}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(call.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <p className="font-medium">{call.score}/100</p>
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full font-mono"
                        style={{ background: result.bg, color: result.color }}
                      >
                        {result.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" asChild className="w-full bg-transparent">
            <Link href="/dashboard/upload">Upload New Call</Link>
          </Button>
          <Button variant="outline" asChild className="w-full bg-transparent">
            <Link href="/dashboard/history">View Full History</Link>
          </Button>
          <Button variant="outline" asChild className="w-full bg-transparent">
            <Link href="/dashboard/settings">Configure Rubric</Link>
          </Button>
          <Button variant="outline" asChild className="w-full bg-transparent">
            <Link href="/dashboard/settings">Customize System Prompt</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
