"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import type { Call } from "@/lib/types"
import { Upload, Phone, CheckCircle, TrendingUp, Clock, Loader2 } from "lucide-react"

export function QuickLinks() {
  return (
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
  )
}

export function DashboardStats() {
  const [stats, setStats] = useState({
    totalCalls: 0,
    passRate: "-",
    avgScore: "-",
    thisWeekCalls: 0,
  })
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
      setLoading(false)
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[120px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Calls</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCalls}</div>
            <p className="text-xs text-muted-foreground">Calls analyzed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pass Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.passRate}</div>
            <p className="text-xs text-muted-foreground">Score ≥ 75</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Score</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgScore}</div>
            <p className="text-xs text-muted-foreground">Per call</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Week</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.thisWeekCalls}</div>
            <p className="text-xs text-muted-foreground">Calls processed</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
