"use client"

import { useState, useCallback, useEffect } from "react"
import { useDropzone } from "react-dropzone"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  Upload,
  FileAudio,
  FileText,
  X,
  Loader2,
  CheckCircle,
  XCircle,
  Send,
  RotateCcw,
  Sparkles,
} from "lucide-react"

type UploadStep = "input" | "processing" | "results" | "sending" | "complete"

type CallOutcome = "closed" | "follow_up" | "objection_unresolved" | "no_decision"

interface FormData {
  trainerName: string
  trainerEmail: string
  clientName: string
  audioFile: File | null
  transcript: string
  scriptId?: string
  callOutcome: CallOutcome
}

interface SectionResult {
  name: string
  score: number
  feedback: string
}

interface AnalysisResult {
  overallScore: number
  sections: SectionResult[]
  criteria: SectionResult[] // backward compat
  detectedOutcome?: CallOutcome
  summary: string
  strengths: string[]
  improvements: string[]
  transcript: string
}

interface Script {
  id: string
  name: string
  description: string
}

const analysisMode = "scripts"; // Declare the analysisMode variable

export default function UploadPage() {
  const [step, setStep] = useState<UploadStep>("input")
  const [uploadType, setUploadType] = useState<"audio" | "transcript">("audio")
  const [progress, setProgress] = useState(0)
  const [formData, setFormData] = useState<FormData>({
    trainerName: "",
    trainerEmail: "",
    clientName: "",
    audioFile: null,
    transcript: "",
    scriptId: "",
    callOutcome: "no_decision",
  })
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [processingStatus, setProcessingStatus] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [scripts, setScripts] = useState<Script[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchScripts() {
      const supabase = createClient()
      const { data: rubricData } = await supabase
        .from("rubrics")
        .select("id")
        .eq("is_active", true)
        .single()

      if (rubricData) {
        const { data: scriptsData } = await supabase
          .from("scripts")
          .select("id, name, description")
          .eq("rubric_id", rubricData.id)

        setScripts(scriptsData || [])
      }
      setLoading(false)
    }

    fetchScripts()
  }, [])

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0]
      if (rejection.errors[0]?.code === "file-too-large") {
        alert("File size must be less than 50MB.")
        return
      }
    }
    if (acceptedFiles.length > 0) {
      setFormData((prev) => ({ ...prev, audioFile: acceptedFiles[0] }))
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "audio/mpeg": [".mp3"],
      "audio/wav": [".wav"],
      "audio/m4a": [".m4a"],
      "audio/ogg": [".ogg"],
      "audio/webm": [".webm"],
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB limit via Blob
  })

  const removeFile = () => {
    setFormData((prev) => ({ ...prev, audioFile: null }))
  }

  const isFormValid = () => {
    const hasTrainerInfo = formData.trainerName && formData.trainerEmail
    const hasContent =
      uploadType === "audio" ? formData.audioFile : formData.transcript.trim()
    return hasTrainerInfo && hasContent
  }

  const handleSubmit = async () => {
    if (!isFormValid()) return

    console.log("[v0] Starting upload with:", { trainerName: formData.trainerName, uploadType, hasAudio: !!formData.audioFile })
    setStep("processing")
    setError(null)
    setProgress(0)

    try {
      let transcript = formData.transcript

      // Step 1: Transcribe audio if needed
      if (uploadType === "audio" && formData.audioFile) {
        // Step 1a: Upload to Vercel Blob via server
        setProcessingStatus("Uploading audio...")
        setProgress(10)

        // Create FormData to send file to server
        const uploadFormData = new FormData()
        uploadFormData.append("file", formData.audioFile)
        uploadFormData.append("filename", formData.audioFile.name)

        const uploadRes = await fetch("/api/blob-token", {
          method: "POST",
          body: uploadFormData,
        })

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}))
          throw new Error(errData.error || "Failed to upload audio")
        }

        const uploadData = await uploadRes.json()
        const blobUrl = uploadData.url

        setProgress(30)

        // Step 1b: Transcribe using Blob URL
        setProcessingStatus("Transcribing audio...")
        setProgress(40)

        const transcribeRes = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            blobUrl, 
            filename: formData.audioFile.name 
          }),
        })

        console.log("[v0] Transcribe response status:", transcribeRes.status)

        if (!transcribeRes.ok) {
          let errorMsg = "Failed to transcribe audio"
          const contentType = transcribeRes.headers.get("content-type") || ""
          if (contentType.includes("application/json")) {
            try {
              const errData = await transcribeRes.clone().json()
              errorMsg = errData.error || errorMsg
            } catch { /* ignore parse error */ }
          } else {
            errorMsg = transcribeRes.status === 404
              ? "API not available — ensure the mock service worker is running (MSW)"
              : `HTTP ${transcribeRes.status}`
          }
          console.error("[v0] Transcribe error:", errorMsg)
          throw new Error(errorMsg)
        }

        const transcribeData = await transcribeRes.json()
        console.log("[v0] Transcript received:", transcribeData.transcript?.substring(0, 100))
        transcript = transcribeData.transcript
        setProgress(50)
      }

      // Step 2: Analyze transcript (API fetches criteria + system prompt from Supabase)
      setProcessingStatus("Analyzing against rubric...")
      setProgress(60)

      console.log("[v0] Starting analysis with transcript length:", transcript.length)
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          trainerName: formData.trainerName,
          scriptId: formData.scriptId,
          callOutcome: formData.callOutcome,
        }),
      })

      console.log("[v0] Analyze response status:", analyzeRes.status)

      if (!analyzeRes.ok) {
        let errorMsg = "Failed to analyze call"
        const contentType = analyzeRes.headers.get("content-type") || ""
        if (contentType.includes("application/json")) {
          try {
            const errData = await analyzeRes.clone().json()
            errorMsg = errData.error || errorMsg
          } catch { /* ignore parse error */ }
        } else {
          errorMsg = analyzeRes.status === 404
            ? "API not available — ensure the mock service worker is running (MSW)"
            : `HTTP ${analyzeRes.status}`
        }
        console.error("[v0] Analyze error:", errorMsg)
        throw new Error(errorMsg)
      }

      const analysis = await analyzeRes.json()
      console.log("[v0] Analysis complete:", { score: analysis.overallScore, criteria: analysis.criteria?.length })
      setProgress(100)
      setAnalysisResult(analysis)
      setStep("results")
    } catch (err) {
      console.error("[v0] Full error:", err)
      setError(err instanceof Error ? err.message : "An error occurred")
      setStep("input")
    }
  }

  const handleSendEmail = async () => {
    if (!analysisResult) return

    setSendingEmail(true)
    setError(null)

    try {
      const emailRes = await fetch("/api/send-coaching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainerName: formData.trainerName,
          trainerEmail: formData.trainerEmail,
          clientName: formData.clientName,
          overallScore: analysisResult.overallScore,
          totalCriteria: analysisResult.sections?.length || analysisResult.criteria.length,
          sections: analysisResult.sections || analysisResult.criteria,
          criteria: analysisResult.sections || analysisResult.criteria,
          summary: analysisResult.summary,
          strengths: analysisResult.strengths,
          improvements: analysisResult.improvements,
          transcript: analysisResult.transcript,
          callOutcome: formData.callOutcome,
          detectedOutcome: analysisResult.detectedOutcome,
        }),
      })

      if (!emailRes.ok) {
        throw new Error("Failed to send coaching email")
      }

      setStep("complete")
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setSendingEmail(false)
    }
  }

  const resetForm = () => {
    setStep("input")
    setProgress(0)
    setAnalysisResult(null)
    setError(null)
    setFormData({
      trainerName: "",
      trainerEmail: "",
      clientName: "",
      audioFile: null,
      transcript: "",
      scriptId: "",
      callOutcome: "no_decision",
    })
  }

  if (step === "processing") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center pb-16 lg:pb-0">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <h3 className="mt-4 text-lg font-semibold">Processing Call</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {processingStatus || "Starting..."}
              </p>
              <Progress value={progress} className="mt-4 w-full" />
              <p className="mt-2 text-sm text-muted-foreground">
                {progress}% complete
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (step === "results" && analysisResult) {
    return (
      <div className="space-y-6 pb-16 lg:pb-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Analysis Results</h2>
            <p className="text-muted-foreground">
              Review the AI coaching feedback for {formData.trainerName}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetForm}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Start Over
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {error}
          </div>
        )}

        {/* Score Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Overall Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-5xl font-bold tabular-nums">
                {analysisResult.overallScore}
                <span className="text-2xl font-normal text-muted-foreground">/100</span>
              </div>
              <div className="flex-1">
                <Progress value={analysisResult.overallScore} className="h-3" />
              </div>
              <Badge
                variant={analysisResult.overallScore >= 80 ? "default" : analysisResult.overallScore >= 60 ? "secondary" : "destructive"}
                className="text-sm"
              >
                {analysisResult.overallScore >= 80 ? "Strong" :
                 analysisResult.overallScore >= 60 ? "Adequate" :
                 analysisResult.overallScore >= 40 ? "Needs Work" : "Critical"}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Average of section scores (1–5 scale) × 20</p>
          </CardContent>
        </Card>

        {/* Section Scores */}
        <Card>
          <CardHeader>
            <CardTitle>Section Breakdown</CardTitle>
            <CardDescription>Score 1–5 per section: 1 = Not attempted, 3 = Adequate, 5 = Excellent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(analysisResult.sections || analysisResult.criteria).map((section, index) => {
              const score = section.score ?? 0
              const pct = ((score - 1) / 4) * 100
              const color = score >= 5 ? "text-green-700 bg-green-50 border-green-200" :
                            score >= 4 ? "text-blue-700 bg-blue-50 border-blue-200" :
                            score >= 3 ? "text-amber-700 bg-amber-50 border-amber-200" :
                            "text-red-700 bg-red-50 border-red-200"
              const barColor = score >= 5 ? "bg-green-500" :
                               score >= 4 ? "bg-blue-500" :
                               score >= 3 ? "bg-amber-500" : "bg-red-500"
              const label = score >= 5 ? "Excellent" : score >= 4 ? "Strong" : score >= 3 ? "Adequate" : score >= 2 ? "Needs Work" : "Not Attempted"
              return (
                <div key={index} className={`rounded-lg border p-4 ${color}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">{section.name}</span>
                    <Badge variant="outline" className="font-bold text-sm">
                      {score}/5 — {label}
                    </Badge>
                  </div>
                  <div className="h-2 rounded-full bg-black/10 mb-3">
                    <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-sm opacity-80">{section.feedback}</p>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Summary & Insights */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-green-500">Strengths</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {analysisResult.strengths.map((strength, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-green-500 shrink-0" />
                    {strength}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-amber-500">Areas for Improvement</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {analysisResult.improvements.map((improvement, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <XCircle className="mt-0.5 h-4 w-4 text-amber-500 shrink-0" />
                    {improvement}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{analysisResult.summary}</p>
          </CardContent>
        </Card>

        {/* Transcript */}
        <Card>
          <CardHeader>
            <CardTitle>Call Transcript</CardTitle>
            <CardDescription>Full transcription for reference and audit</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-muted/50 p-4 font-mono text-sm max-h-96 overflow-y-auto whitespace-pre-wrap break-words scrollbar-thin scrollbar-thumb-muted-foreground/30 hover:scrollbar-thumb-muted-foreground/50">
              {analysisResult.transcript}
            </div>
          </CardContent>
        </Card>

        {/* Send Email Action */}
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <h3 className="font-semibold">Ready to send coaching feedback?</h3>
                <p className="text-sm text-muted-foreground">
                  This will send a motivational coaching email to {formData.trainerEmail}
                </p>
              </div>
              <Button 
                size="lg" 
                className="mt-4 sm:mt-0"
                onClick={handleSendEmail}
                disabled={sendingEmail}
              >
                {sendingEmail ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Coaching Email
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (step === "complete") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center pb-16 lg:pb-0">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <div className="rounded-full bg-green-500/10 p-3">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Email Sent Successfully!</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Coaching feedback has been sent to {formData.trainerEmail}
              </p>
              <div className="mt-6 flex gap-2">
                <Button variant="outline" onClick={resetForm}>
                  Upload Another
                </Button>
                <Button asChild>
                  <a href="/dashboard/history">View History</a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-16 lg:pb-0">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Upload Call</h2>
        <p className="text-muted-foreground">
          Upload an audio file or paste a transcript for AI coaching analysis
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trainer Info */}
        <Card>
          <CardHeader>
            <CardTitle>Trainer Information</CardTitle>
            <CardDescription>
              Who should receive the coaching email?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trainerName">Trainer Name</Label>
              <Input
                id="trainerName"
                placeholder="e.g., John Smith"
                value={formData.trainerName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    trainerName: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trainerEmail">Trainer Email</Label>
              <Input
                id="trainerEmail"
                type="email"
                placeholder="e.g., john@example.com"
                value={formData.trainerEmail}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    trainerEmail: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientName">Client Name</Label>
              <Input
                id="clientName"
                placeholder="e.g., Jane Doe"
                value={formData.clientName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    clientName: e.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">Name of the prospect or customer on the call</p>
            </div>
            {scripts.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="scriptId">Sales Script *</Label>
                <select
                  id="scriptId"
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                  value={formData.scriptId}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      scriptId: e.target.value,
                    }))
                  }
                >
                  <option value="">Select a script...</option>
                  {scripts.map((script) => (
                    <option key={script.id} value={script.id}>
                      {script.name} - {script.description}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Required to analyze the call against your sales process</p>
              </div>
            )}
            {scripts.length === 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded">
                <p className="text-sm text-amber-800 dark:text-amber-200">No sales scripts available. Create one in Settings first.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Call Outcome *</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "closed", label: "Closed", color: "bg-green-100 border-green-500 text-green-700 dark:bg-green-900 dark:text-green-300" },
                  { value: "follow_up", label: "Follow-up Scheduled", color: "bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
                  { value: "objection_unresolved", label: "Objection Unresolved", color: "bg-amber-100 border-amber-500 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
                  { value: "no_decision", label: "No Decision", color: "bg-red-100 border-red-500 text-red-700 dark:bg-red-900 dark:text-red-300" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, callOutcome: option.value as CallOutcome }))}
                    className={`px-3 py-2.5 rounded-md border-2 text-sm font-medium transition-all text-left ${
                      formData.callOutcome === option.value
                        ? option.color
                        : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">How did this call end?</p>
            </div>
          </CardContent>
        </Card>

        {/* Call Content */}
        <Card>
          <CardHeader>
            <CardTitle>Call Content</CardTitle>
            <CardDescription>
              Upload audio or paste the transcript directly
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={uploadType}
              onValueChange={(v) => setUploadType(v as "audio" | "transcript")}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="audio">
                  <FileAudio className="mr-2 h-4 w-4" />
                  Audio File
                </TabsTrigger>
                <TabsTrigger value="transcript">
                  <FileText className="mr-2 h-4 w-4" />
                  Transcript
                </TabsTrigger>
              </TabsList>

              <TabsContent value="audio" className="mt-4">
                {formData.audioFile ? (
                  <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-4">
                    <div className="flex items-center gap-3">
                      <FileAudio className="h-8 w-8 text-primary" />
                      <div>
                        <p className="font-medium">{formData.audioFile.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(formData.audioFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={removeFile}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    {...getRootProps()}
                    className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                      isDragActive
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <input {...getInputProps()} />
                    <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">
                      {isDragActive
                        ? "Drop the file here"
                        : "Drag & drop audio file"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      MP3, WAV, M4A, OGG, WEBM
                    </p>
                    <Button variant="outline" size="sm" className="mt-4 bg-transparent">
                      Browse Files
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="transcript" className="mt-4">
                <Textarea
                  placeholder="Paste the call transcript here..."
                  rows={10}
                  value={formData.transcript}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      transcript: e.target.value,
                    }))
                  }
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {formData.transcript.length} characters
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={!isFormValid()}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Analyze Call
        </Button>
      </div>
    </div>
  )
}
