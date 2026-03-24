"use client"

import { useState, useEffect, useMemo } from "react"
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

interface Call {
  id: string
  trainer_name: string
  trainer_email: string
  created_at: string
  overall_score: number
  total_criteria: number
  criteria: any[]
  summary: string
  strengths: string[]
  improvements: string[]
  call_outcome?: "closed" | "not_closed" | "partial"
}

const ITEMS_PER_PAGE = 10

export default function HistoryPage() {
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  const supabase = useMemo(() => {
    return createClient()
  }, [])

  useEffect(() => {
    async function fetchCalls() {
      setLoading(true)
      const { data, error } = await supabase
        .from("calls")
        .select("*, call_outcome")
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
      call.trainer_email.toLowerCase().includes(searchTerm.toLowerCase())
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
            placeholder="Search by trainer name or email..."
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
                      <TableHead>Date</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Pass Rate</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCalls.map((call) => (
                      <TableRow key={call.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{call.trainer_name}</p>
                            <p className="text-sm text-muted-foreground">{call.trainer_email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(call.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {call.call_outcome && (
                            <Badge
                              variant={
                                call.call_outcome === "closed"
                                  ? "default"
                                  : call.call_outcome === "partial"
                                  ? "secondary"
                                  : "destructive"
                              }
                            >
                              {call.call_outcome === "closed"
                                ? "Closed"
                                : call.call_outcome === "partial"
                                ? "Partial"
                                : "Not Closed"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={call.overall_score >= call.total_criteria * 0.6 ? "default" : "destructive"}>
                            {call.overall_score}/{call.total_criteria}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {passRate(call.overall_score, call.total_criteria) >= 60 ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            {passRate(call.overall_score, call.total_criteria)}%
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
          {selectedCall && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedCall.trainer_name}</DialogTitle>
                <DialogDescription>
                  {new Date(selectedCall.created_at).toLocaleString()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Score */}
                <div className="rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 p-4 text-white">
                  <div className="text-4xl font-bold">
                    {selectedCall.overall_score}/{selectedCall.total_criteria}
                  </div>
                  <p className="text-sm opacity-90">Criteria Passed ({passRate(selectedCall.overall_score, selectedCall.total_criteria)}%)</p>
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
                      {selectedCall.improvements.map((i, idx) => (
                        <li key={idx} className="flex gap-2">
                          <XCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          {i}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Criteria */}
                <div>
                  <h3 className="font-semibold mb-3">Detailed Breakdown</h3>
                  <div className="space-y-3">
                    {selectedCall.criteria?.map((c, i) => (
                      <div key={i} className="rounded-lg border p-3">
                        <div className="flex items-center gap-2 mb-1">
                          {c.passed ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="font-medium text-sm">{c.name}</span>
                          <Badge variant={c.passed ? "default" : "destructive"} className="ml-auto">
                            {c.passed ? "Pass" : "Fail"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{c.feedback}</p>
                      </div>
                    ))}
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
