"use client"

import { useState, useEffect } from "react"
import { useLocale, useTranslations } from "next-intl"
import type { Call } from "@/lib/types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, CheckCircle, XCircle, Eye, Loader2 } from "lucide-react"
import { RESULT_STYLES, DEFAULT_RESULT_STYLE, CALL_OUTCOMES } from "@/lib/constants"

const RUBRIC_KEYS = ['discovery', 'problemAgitation', 'offerPresentation', 'objectionHandling', 'closeAndNextSteps'] as const


export default function HistoryPage() {
  const t = useTranslations("Dashboard.history")
  const tTh = useTranslations("Dashboard.history.th")
  const tRubric = useTranslations("Shared.rubric")
  const tOutcomes = useTranslations("Shared.outcomes")
  const locale = useLocale()
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all")
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  useEffect(() => {
    async function fetchCalls() {
      setLoading(true)
      // `translate=true` opts this listing into server-side translation of
      // the coaching text fields (feedback/strengths/improvements) used in
      // the detail modal. Other consumers of /api/calls (the owner /calls
      // page, /me list) don't render those fields and skip the flag.
      const res = await fetch(`/api/calls?translate=true`, {
        headers: { "x-locale": locale },
      })
      const { data, error } = (await res.json()) as { data: Call[] | null; error: unknown }
      if (!error && data) {
        setCalls([...data].sort((a, b) => b.date.localeCompare(a.date)))
      }
      setLoading(false)
    }
    fetchCalls()
  }, [locale])

  const filteredCalls = calls.filter((call) => {
    const matchesSearch =
      call.trainerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.prospect.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesOutcome =
      outcomeFilter === "all" || call.result === outcomeFilter
    return matchesSearch && matchesOutcome
  })

  const paginatedCalls = filteredCalls.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )
  const totalPages = Math.ceil(filteredCalls.length / ITEMS_PER_PAGE)

  function outcomeLabel(result: string) {
    return result in RESULT_STYLES ? tOutcomes(`short.${result}`) : tOutcomes('unknown')
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const countLabel = filteredCalls.length === 1
    ? t('callsFoundOne', { count: filteredCalls.length })
    : t('callsFoundOther', { count: filteredCalls.length })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            {t('searchCalls')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              className="flex-1"
            />
            <Select
              value={outcomeFilter}
              onValueChange={(v) => {
                setOutcomeFilter(v)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tOutcomes('all')}</SelectItem>
                {CALL_OUTCOMES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {tOutcomes(`short.${option.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('allCalls')}</CardTitle>
          <CardDescription>
            {countLabel}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredCalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground">{t('noCallsFound')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tTh('salesPerson')}</TableHead>
                      <TableHead>{tTh('prospect')}</TableHead>
                      <TableHead>{tTh('date')}</TableHead>
                      <TableHead>{tTh('outcome')}</TableHead>
                      <TableHead>{tTh('score')}</TableHead>
                      <TableHead className="text-right">{tTh('actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCalls.map((call) => (
                      <TableRow key={call.id}>
                        <TableCell>
                          <p className="font-medium">{call.trainerName}</p>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{call.prospect}</span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(call.date).toLocaleDateString(locale)}
                        </TableCell>
                        <TableCell>
                          <Badge style={{ background: (RESULT_STYLES[call.result] ?? DEFAULT_RESULT_STYLE).bg, color: (RESULT_STYLES[call.result] ?? DEFAULT_RESULT_STYLE).color }}>
                            {outcomeLabel(call.result)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold tabular-nums">{call.score}</span>
                            <span className="text-muted-foreground text-sm">/100</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedCall(call)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            {t('view')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t pt-4">
                  <p className="text-sm text-muted-foreground">
                    {t('showingRange', {
                      from: (currentPage - 1) * ITEMS_PER_PAGE + 1,
                      to: Math.min(currentPage * ITEMS_PER_PAGE, filteredCalls.length),
                      total: filteredCalls.length,
                    })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      {t('previous')}
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }).map((_, i) => (
                        <Button
                          key={i + 1}
                          variant={currentPage === i + 1 ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(i + 1)}
                          className="w-10 h-10 p-0"
                        >
                          {i + 1}
                        </Button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      {t('next')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selectedCall} onOpenChange={() => setSelectedCall(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedCall && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedCall.trainerName}
                  <span className="text-muted-foreground font-normal text-base">
                    {t('with', { prospect: selectedCall.prospect })}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  {new Date(selectedCall.date).toLocaleDateString(locale)} · {selectedCall.duration}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Score */}
                <div className="rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 p-4 text-white">
                  <div className="text-5xl font-bold">
                    {selectedCall.score}
                    <span className="text-2xl font-normal opacity-80">/100</span>
                  </div>
                  <p className="text-sm opacity-90 mt-1">{t('overallScore')}</p>
                </div>

                {/* Outcome */}
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">{t('outcome')}</p>
                  <Badge style={{ background: (RESULT_STYLES[selectedCall.result] ?? DEFAULT_RESULT_STYLE).bg, color: (RESULT_STYLES[selectedCall.result] ?? DEFAULT_RESULT_STYLE).color }}>
                    {outcomeLabel(selectedCall.result)}
                  </Badge>
                </div>

                {/* Summary */}
                <div>
                  <h3 className="font-semibold mb-2">{t('summary')}</h3>
                  <p className="text-sm text-muted-foreground">{selectedCall.feedback}</p>
                </div>

                {/* Strengths */}
                {selectedCall.strengths?.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2 text-green-600">{t('strengths')}</h3>
                    <ul className="space-y-1 text-sm">
                      {selectedCall.strengths.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Improvements */}
                {selectedCall.improvements?.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2 text-amber-600">{t('areasToImprove')}</h3>
                    <ul className="space-y-1 text-sm">
                      {selectedCall.improvements.map((item, idx) => (
                        <li key={idx} className="flex gap-2">
                          <XCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Section Scores */}
                <div>
                  <h3 className="font-semibold mb-3">{t('sectionBreakdown')}</h3>
                  <div className="space-y-3">
                    {Object.entries(selectedCall.rubricScores).map(([key, score]) => {
                      const pct = score
                      const color =
                        score >= 85 ? "bg-green-500" : score >= 75 ? "bg-amber-500" : "bg-red-500"
                      const textColor =
                        score >= 85
                          ? "bg-green-100 border-green-200 text-green-700"
                          : score >= 75
                            ? "bg-amber-100 border-amber-200 text-amber-700"
                            : "bg-red-100 border-red-200 text-red-700"
                      const label = (RUBRIC_KEYS as readonly string[]).includes(key) ? tRubric(key) : key
                      return (
                        <div key={key} className={`rounded-lg border p-3 ${textColor}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">
                              {label}
                            </span>
                            <Badge variant="outline" className={`font-semibold ${textColor}`}>
                              {score}/100
                            </Badge>
                          </div>
                          <div className="h-1.5 rounded-full bg-black/10">
                            <div
                              className={`h-1.5 rounded-full ${color}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
