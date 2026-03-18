"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
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

type CallOutcome = "closed" | "follow_up" | "objection_unresolved" | "no_decision" | "not_closed" | "partial"

interface Call {
  id: string
  trainer_name: string
  trainer_email: string
  client_name?: string
  created_at: string
  overall_score: number
  total_criteria: number
  criteria: any[]
  summary: string
  strengths: string[]
  improvements: string[]
  call_outcome?: CallOutcome
  detected_outcome?: CallOutcome
}

export default function HistoryPage() {
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  const supabase = createClient()

  useEffect(() => {
    async function fetchCalls() {
      setLoading(true)
      const { data, error } = await supabase
        .from("calls")
        .select("*, call_outcome, client_name, detected_outcome")
        .order("created_at", { ascending: false })

      if (error) {
        console.error("[v0] Error fetching calls:", error)
      } else {
        console.log("[v0] Fetched calls:", data?.length, "total")
        setCalls(data || [])
      }
      setLoading(false)
    }

    fetchCalls()
  }, [])

  const filteredCalls = calls.filter(
    (call) =>
      call.trainer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.trainer_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (call.client_name && call.client_name.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const paginatedCalls = filteredCalls.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )
  const totalPages = Math.ceil(filteredCalls.length / ITEMS_PER_PAGE)

  const passRate = (score: number, total: number) => 
    total > 0 ? Math.round((score / total) * 100) : 0

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

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search by trainer name, client name, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Calls Table */}
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
              <Button variant="outline" className="mt-4 bg-transparent">
                Start by uploading a call
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trainer</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reported</TableHead>
                      <TableHead>AI Detected</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCalls.map((call) => {
                      const outcomeLabels: Record<string, string> = {
                        closed: "Closed",
                        follow_up: "Follow-up",
                        objection_unresolved: "Objection",
                        no_decision: "No Decision",
                        not_closed: "Not Closed",
                        partial: "Partial",
                      }
                      const outcomeVariant = (outcome?: string) => {
                        if (outcome === "closed") return "default"
                        if (outcome === "follow_up") return "secondary"
                        if (outcome === "objection_unresolved" || outcome === "partial") return "outline"
                        return "destructive"
                      }
                      return (
                        <TableRow key={call.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{call.trainer_name}</p>
                              <p className="text-xs text-muted-foreground">{call.trainer_email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {call.client_name ? (
                              <span className="font-medium">{call.client_name}</span>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(call.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {call.call_outcome && (
                              <Badge variant={outcomeVariant(call.call_outcome)}>
                                {outcomeLabels[call.call_outcome] || call.call_outcome}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {call.detected_outcome ? (
                              <Badge variant={outcomeVariant(call.detected_outcome)} className={call.detected_outcome !== call.call_outcome ? "ring-2 ring-amber-400" : ""}>
                                {outcomeLabels[call.detected_outcome] || call.detected_outcome}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold tabular-nums">{call.overall_score}</span>
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
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
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
          {selectedCall && (() => {
            const outcomeLabels: Record<string, string> = {
              closed: "Closed",
              follow_up: "Follow-up Scheduled",
              objection_unresolved: "Objection Unresolved",
              no_decision: "No Decision",
              not_closed: "Not Closed",
              partial: "Partial",
            }
            const scoreLabel = (score: number) => score >= 5 ? "Excellent" : score >= 4 ? "Strong" : score >= 3 ? "Adequate" : score >= 2 ? "Needs Work" : "Not Attempted"
            const scoreColor = (score: number) => score >= 5 ? "bg-green-100 border-green-200 text-green-700" : score >= 4 ? "bg-blue-100 border-blue-200 text-blue-700" : score >= 3 ? "bg-amber-100 border-amber-200 text-amber-700" : "bg-red-100 border-red-200 text-red-700"
            const barColor = (score: number) => score >= 5 ? "bg-green-500" : score >= 4 ? "bg-blue-500" : score >= 3 ? "bg-amber-500" : "bg-red-500"
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selectedCall.trainer_name}
                    {selectedCall.client_name && (
                      <span className="text-muted-foreground font-normal text-base">with {selectedCall.client_name}</span>
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    {new Date(selectedCall.created_at).toLocaleString()}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                  {/* Score */}
                  <div className="rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 p-4 text-white">
                    <div className="text-5xl font-bold">
                      {selectedCall.overall_score}<span className="text-2xl font-normal opacity-80">/100</span>
                    </div>
                    <p className="text-sm opacity-90 mt-1">Overall Score</p>
                  </div>

                  {/* Outcomes */}
                  <div className="flex gap-4">
                    <div className="flex-1 rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground mb-1">Reported Outcome</p>
                      <Badge variant={selectedCall.call_outcome === "closed" ? "default" : "secondary"}>
                        {selectedCall.call_outcome ? outcomeLabels[selectedCall.call_outcome] : "-"}
                      </Badge>
                    </div>
                    <div className="flex-1 rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground mb-1">AI Detected</p>
                      {selectedCall.detected_outcome ? (
                        <Badge variant={selectedCall.detected_outcome === "closed" ? "default" : "secondary"} className={selectedCall.detected_outcome !== selectedCall.call_outcome ? "ring-2 ring-amber-400" : ""}>
                          {outcomeLabels[selectedCall.detected_outcome]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </div>
                  </div>

                  {/* Summary */}
                  <div>
                    <h3 className="font-semibold mb-2">Summary</h3>
                    <p className="text-sm text-muted-foreground">{selectedCall.summary}</p>
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
                      {selectedCall.criteria?.map((c, i) => {
                        const score = c.score ?? (c.passed ? 5 : 2)
                        const pct = ((score - 1) / 4) * 100
                        return (
                          <div key={i} className={`rounded-lg border p-3 ${scoreColor(score)}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-sm">{c.name}</span>
                              <Badge variant="outline" className="font-semibold">
                                {score}/5 — {scoreLabel(score)}
                              </Badge>
                            </div>
                            <div className="h-1.5 rounded-full bg-black/10 mb-2">
                              <div className={`h-1.5 rounded-full ${barColor(score)}`} style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-sm opacity-80">{c.feedback}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
