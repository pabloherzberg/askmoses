"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, TrendingUp, Award, Zap, Target } from "lucide-react"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

interface Call {
  id: string
  trainer_name: string
  created_at: string
  overall_score: number
  total_criteria: number
  criteria: any[]
  call_outcome: string
}

interface CriteriaFailures {
  name: string
  failures: number
  percentage: number
}

interface Achievement {
  trainer: string
  badge: string
  icon: string
  reason: string
}

export default function AnalyticsPage() {
  const [calls, setCalls] = useState<Call[]>([])
  const [trendData, setTrendData] = useState<any[]>([])
  const [criteriaFailures, setCriteriaFailures] = useState<CriteriaFailures[]>([])
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)
  const [insights, setInsights] = useState<string[]>([])
  const [outcomeMetrics, setOutcomeMetrics] = useState({ closed: 0, notClosed: 0, partial: 0, closeRate: 0 })
  const [trainerConversions, setTrainerConversions] = useState<{ name: string; closed: number; total: number; rate: number }[]>([])

  const supabase = createClient()

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true)

      // Fetch all calls
      const { data: callsData } = await supabase
        .from("calls")
        .select("*")
        .order("created_at", { ascending: true })

      if (!callsData) {
        setLoading(false)
        return
      }

      setCalls(callsData)

      // Build trend data (group by day)
      const trends = new Map<string, { total: number; count: number }>()
      callsData.forEach((call) => {
        const date = new Date(call.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
        if (!trends.has(date)) {
          trends.set(date, { total: 0, count: 0 })
        }
        const entry = trends.get(date)!
        entry.total += call.overall_score
        entry.count += 1
      })

      const trendArray = Array.from(trends.entries()).map(([date, data]) => ({
        date,
        avgScore: parseFloat((data.total / data.count / data.count * 100).toFixed(1)),
        calls: data.count,
      }))
      setTrendData(trendArray)

      // Calculate criteria failures
      const failureMap = new Map<string, number>()
      const totalCriteria = new Map<string, number>()

      callsData.forEach((call) => {
        call.criteria.forEach((c: any) => {
          const key = c.name
          totalCriteria.set(key, (totalCriteria.get(key) || 0) + 1)
          if (!c.passed) {
            failureMap.set(key, (failureMap.get(key) || 0) + 1)
          }
        })
      })

      const failures = Array.from(failureMap.entries())
        .map(([name, failures]) => ({
          name,
          failures,
          percentage: Math.round((failures / (totalCriteria.get(name) || 1)) * 100),
        }))
        .sort((a, b) => b.failures - a.failures)
        .slice(0, 5)

      setCriteriaFailures(failures)

      // Calculate achievements
      const trainerScores = new Map<string, { total: number; count: number; perfect: number }>()
      callsData.forEach((call) => {
        const key = call.trainer_name
        if (!trainerScores.has(key)) {
          trainerScores.set(key, { total: 0, count: 0, perfect: 0 })
        }
        const entry = trainerScores.get(key)!
        entry.total += call.overall_score
        entry.count += 1
        if (call.overall_score === call.total_criteria) {
          entry.perfect += 1
        }
      })

      const achievementsList: Achievement[] = []

      // Best performer
      const trainerEntries = Array.from(trainerScores.entries())
      if (trainerEntries.length > 0) {
        const [topTrainer, topStats] = trainerEntries.reduce((a, b) =>
          b[1].total / b[1].count > a[1].total / a[1].count ? b : a
        )

        if (topTrainer && topStats.count > 0) {
          achievementsList.push({
            trainer: topTrainer,
            badge: "Master Coach",
            icon: "👑",
            reason: `Highest average score: ${(topStats.total / topStats.count).toFixed(1)}/5`,
          })
        }
      }

      // Perfect calls
      const perfectTrainer = Array.from(trainerScores.entries()).find(
        ([_, stats]) => stats.perfect > 0
      )
      if (perfectTrainer) {
        achievementsList.push({
          trainer: perfectTrainer[0],
          badge: "Perfect Calls",
          icon: "⭐",
          reason: `${perfectTrainer[1].perfect} perfect call(s)`,
        })
      }

      // Rising star (recent improvement)
      if (callsData.length >= 4) {
        const recent = callsData.slice(-3)
        const older = callsData.slice(0, 3)
        const recentAvg = recent.reduce((sum, c) => sum + c.overall_score, 0) / recent.length
        const olderAvg = older.reduce((sum, c) => sum + c.overall_score, 0) / older.length
        const risingStar = recent.reduce((prev, call) =>
          (recentAvg > olderAvg) ? call.trainer_name : prev
        , "")
        if (risingStar && recentAvg > olderAvg) {
          achievementsList.push({
            trainer: risingStar,
            badge: "Rising Star",
            icon: "🚀",
            reason: "Recent improvement trend",
          })
        }
      }

      setAchievements(achievementsList)

      // Build insights
      const insightsList: string[] = []
      if (callsData.length > 0) {
        const avgScore = callsData.reduce((sum, c) => sum + c.overall_score, 0) / callsData.length
        insightsList.push(
          `Overall performance: ${(avgScore / callsData[0].total_criteria * 100).toFixed(0)}% pass rate across ${callsData.length} calls`
        )
      }

      if (failures.length > 0) {
        insightsList.push(
          `Top improvement area: "${failures[0].name}" with ${failures[0].percentage}% failure rate`
        )
      }

      if (trainerScores.size > 0) {
        const avgTrainers = Array.from(trainerScores.values()).reduce(
          (sum, s) => sum + s.total / s.count,
          0
        ) / trainerScores.size
        insightsList.push(
          `Team average: ${(avgTrainers / callsData[0]?.total_criteria * 100).toFixed(0)}% - Focus on consistency`
        )
      }

      setInsights(insightsList)

      // Calculate outcome metrics
      const closed = callsData.filter((c) => c.call_outcome === "closed").length
      const notClosed = callsData.filter((c) => c.call_outcome === "not_closed").length
      const partial = callsData.filter((c) => c.call_outcome === "partial").length
      const closeRate = callsData.length > 0 ? Math.round((closed / callsData.length) * 100) : 0
      setOutcomeMetrics({ closed, notClosed, partial, closeRate })

      // Calculate per-trainer conversion rates
      const trainerMap = new Map<string, { closed: number; total: number }>()
      callsData.forEach((call) => {
        if (!trainerMap.has(call.trainer_name)) {
          trainerMap.set(call.trainer_name, { closed: 0, total: 0 })
        }
        const entry = trainerMap.get(call.trainer_name)!
        entry.total += 1
        if (call.call_outcome === "closed") entry.closed += 1
      })
      const conversions = Array.from(trainerMap.entries())
        .map(([name, data]) => ({
          name,
          closed: data.closed,
          total: data.total,
          rate: data.total > 0 ? Math.round((data.closed / data.total) * 100) : 0,
        }))
        .sort((a, b) => b.rate - a.rate)
      setTrainerConversions(conversions)

      setLoading(false)
    }

    fetchAnalytics()
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
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Analytics & Insights</h2>
        <p className="text-muted-foreground">
          Aggregate performance trends and improvement recommendations
        </p>
      </div>

      {/* Key Insights */}
      {insights.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
          {insights.map((insight, idx) => (
            <Card key={idx}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">Insight</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{insight}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Conversion Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">{outcomeMetrics.closed}</p>
            <p className="text-sm text-muted-foreground">Closed Deals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">{outcomeMetrics.notClosed}</p>
            <p className="text-sm text-muted-foreground">Not Closed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{outcomeMetrics.partial}</p>
            <p className="text-sm text-muted-foreground">Partial</p>
          </CardContent>
        </Card>
        <Card className={outcomeMetrics.closeRate >= 50 ? "border-green-200 dark:border-green-800" : "border-red-200 dark:border-red-800"}>
          <CardContent className="pt-6">
            <p className={`text-3xl font-bold ${outcomeMetrics.closeRate >= 50 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {outcomeMetrics.closeRate}%
            </p>
            <p className="text-sm text-muted-foreground">Close Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Trainer Conversion Leaderboard */}
      {trainerConversions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              Conversion Leaderboard
            </CardTitle>
            <CardDescription>Close rate per trainer</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {trainerConversions.map((trainer, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{trainer.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${trainer.rate >= 50 ? "bg-green-500" : "bg-red-500"}`}
                          style={{ width: `${trainer.rate}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {trainer.closed}/{trainer.total} ({trainer.rate}%)
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Performance Trend
            </CardTitle>
            <CardDescription>Average score over time</CardDescription>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="avgScore"
                    stroke="#3b82f6"
                    name="Avg Score %"
                    isAnimationActive={true}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-80 items-center justify-center text-muted-foreground">
                No data available yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Criteria Failures Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Top Improvement Areas
            </CardTitle>
            <CardDescription>Criteria with highest failure rates</CardDescription>
          </CardHeader>
          <CardContent>
            {criteriaFailures.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={criteriaFailures}
                  layout="vertical"
                  margin={{ left: 120 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={110} />
                  <Tooltip />
                  <Bar dataKey="percentage" fill="#ef4444" name="Failure %" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-80 items-center justify-center text-muted-foreground">
                No data available yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Achievements */}
      {achievements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              Team Achievements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {achievements.map((achievement, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{achievement.icon}</span>
                        <Badge variant="secondary">{achievement.badge}</Badge>
                      </div>
                      <p className="mt-2 font-medium">{achievement.trainer}</p>
                      <p className="text-sm text-muted-foreground">{achievement.reason}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {calls.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">No data yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Process some calls to see analytics and insights
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
