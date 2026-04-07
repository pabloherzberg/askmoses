"use client"

import { useState, useEffect } from "react"
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
import { Search, CheckCircle, XCircle, Eye, Loader2 } from "lucide-react"
import { RESULT_STYLES, DEFAULT_RESULT_STYLE } from "@/lib/constants"

const RUBRIC_LABELS: Record<string, string> = {
  discovery: "Discovery",
  problemAgitation: "Problem Agitation",
  offerPresentation: "Offer Presentation",
  objectionHandling: "Objection Handling",
  closeAndNextSteps: "Close & Next Steps",
}


export default function HistoryPage() {
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  useEffect(() => {
    async function fetchCalls() {
      setLoading(true)
      const res = await fetch("/api/calls")
      const { data, error } = (await res.json()) as { data: Call[] | null; error: unknown }
      if (!error && data) {
        setCalls([...data].sort((a, b) => b.date.localeCompare(a.date)))
      }
      setLoading(false)
    }
    fetchCalls()
  }, [])

  const filteredCalls = calls.filter(
    (call) =>
      call.trainerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.prospect.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const paginatedCalls = filteredCalls.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )
  const totalPages = Math.ceil(filteredCalls.length / ITEMS_PER_PAGE)

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Call History</h1>
        <p className="text-muted-foreground">Review all processed sales calls and coaching feedback</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search by trainer name or prospect..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Calls</CardTitle>
          <CardDescription>
            {filteredCalls.length} call{filteredCalls.length !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredCalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground">No calls found</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trainer</TableHead>
                      <TableHead>Prospect</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
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
                          {new Date(call.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge style={{ background: (RESULT_STYLES[call.result] ?? DEFAULT_RESULT_STYLE).bg, color: (RESULT_STYLES[call.result] ?? DEFAULT_RESULT_STYLE).color }}>
                            {(RESULT_STYLES[call.result] ?? DEFAULT_RESULT_STYLE).label}
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
                            View
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
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                    {Math.min(currentPage * ITEMS_PER_PAGE, filteredCalls.length)} of{" "}
                    {filteredCalls.length}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
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
                      Next
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
                    with {selectedCall.prospect}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  {new Date(selectedCall.date).toLocaleDateString()} · {selectedCall.duration}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Score */}
                <div className="rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 p-4 text-white">
                  <div className="text-5xl font-bold">
                    {selectedCall.score}
                    <span className="text-2xl font-normal opacity-80">/100</span>
                  </div>
                  <p className="text-sm opacity-90 mt-1">Overall Score</p>
                </div>

                {/* Outcome */}
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Outcome</p>
                  <Badge style={{ background: (RESULT_STYLES[selectedCall.result] ?? DEFAULT_RESULT_STYLE).bg, color: (RESULT_STYLES[selectedCall.result] ?? DEFAULT_RESULT_STYLE).color }}>
                    {(RESULT_STYLES[selectedCall.result] ?? DEFAULT_RESULT_STYLE).label}
                  </Badge>
                </div>

                {/* Summary */}
                <div>
                  <h3 className="font-semibold mb-2">Summary</h3>
                  <p className="text-sm text-muted-foreground">{selectedCall.feedback}</p>
                </div>

                {/* Strengths */}
                {selectedCall.strengths?.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2 text-green-600">Strengths</h3>
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
                    <h3 className="font-semibold mb-2 text-amber-600">Areas to Improve</h3>
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
                  <h3 className="font-semibold mb-3">Section Breakdown</h3>
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
                      return (
                        <div key={key} className={`rounded-lg border p-3 ${textColor}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">
                              {RUBRIC_LABELS[key] ?? key}
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
