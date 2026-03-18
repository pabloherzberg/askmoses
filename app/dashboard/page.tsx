"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import {
  Upload,
  Phone,
  CheckCircle,
  XCircle,
  TrendingUp,
  Clock,
  Loader2,
} from "lucide-react"

interface Call {
  id: string
  trainer_name: string
  trainer_email: string
  created_at: string
  overall_score: number
  total_criteria: number
  criteria: any[]
}

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalCalls: 0,
    passRate: "-",
    avgScore: "-",
    thisWeekCalls: 0,
  })
  const [recentCalls, setRecentCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    async function fetchStats() {
      setLoading(true)

      // Fetch all calls
      const { data: callsData, error: callsError } = await supabase
        .from("calls")
        .select("*")
        .order("created_at", { ascending: false })

      if (callsError) {
        console.error("[v0] Error fetching calls:", callsError)
        setLoading(false)
        return
      }

      const calls = callsData || []

      // Calculate stats
      const totalCalls = calls.length
      const passedCriteria = calls.reduce((sum, call) => sum + call.overall_score, 0)
      const totalCriteria = calls.reduce((sum, call) => sum + call.total_criteria, 0)
      const passRate = totalCriteria > 0 ? Math.round((passedCriteria / totalCriteria) * 100) : 0
      const avgScore = totalCalls > 0 ? (passedCriteria / totalCalls).toFixed(1) : "-"

      // Count this week
      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const thisWeekCalls = calls.filter(
        (call) => new Date(call.created_at) > weekAgo
      ).length

      setStats({
        totalCalls,
        passRate: `${passRate}%`,
        avgScore: avgScore === "-" ? "-/5" : `${avgScore}/5`,
        thisWeekCalls,
      })

      // Recent calls (first 5)
      setRecentCalls(calls.slice(0, 5))
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
            <p className="text-xs text-muted-foreground">Criteria passed</p>
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
                const passRate = call.total_criteria > 0 
                  ? Math.round((call.overall_score / call.total_criteria) * 100)
                  : 0
                const isPassed = passRate >= 60

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
                        <p className="font-medium">{call.trainer_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(call.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{call.overall_score}/{call.total_criteria}</p>
                      <p className="text-sm text-muted-foreground">{passRate}%</p>
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
