"use client"

import { useState, useEffect } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import type { Call } from "@/lib/types"
import {
  Upload,
  Phone,
  CheckCircle,
  TrendingUp,
  Clock,
  Loader2,
} from "lucide-react"

export default function DashboardPage() {
  const t = useTranslations("Dashboard.home")
  const locale = useLocale()
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
          <h2 className="text-2xl font-bold tracking-tight">{t("welcomeBack")}</h2>
          <p className="text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        <Button asChild>
          <Link href={`/${locale}/dashboard/upload`}>
            <Upload className="mr-2 h-4 w-4" />
            {t("uploadCall")}
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("totalCalls")}
            </CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCalls}</div>
            <p className="text-xs text-muted-foreground">{t("callsAnalyzed")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("passRate")}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.passRate}</div>
            <p className="text-xs text-muted-foreground">{t("passRateHint")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("avgScore")}
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgScore}</div>
            <p className="text-xs text-muted-foreground">{t("perCall")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("thisWeek")}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.thisWeekCalls}</div>
            <p className="text-xs text-muted-foreground">{t("callsProcessed")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>{t("quickLinks")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" asChild className="w-full bg-transparent">
            <Link href={`/${locale}/dashboard/upload`}>{t("uploadNewCall")}</Link>
          </Button>
          <Button variant="outline" asChild className="w-full bg-transparent">
            <Link href={`/${locale}/dashboard/history`}>{t("viewFullHistory")}</Link>
          </Button>
          <Button variant="outline" asChild className="w-full bg-transparent">
            <Link href={`/${locale}/dashboard/settings`}>{t("configureRubric")}</Link>
          </Button>
          <Button variant="outline" asChild className="w-full bg-transparent">
            <Link href={`/${locale}/dashboard/settings`}>{t("customizeSystemPrompt")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
