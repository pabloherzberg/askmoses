"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { upload } from "@vercel/blob/client"
import { useRouter } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  FileAudio,
  FileText,
  X,
  Loader2,
  Wand2,
  Sparkles,
  CheckCircle,
  Save,
  Lightbulb,
} from "lucide-react"

interface AudioFile {
  file: File
  name: string
  status: "pending" | "uploading" | "transcribing" | "done" | "error"
  transcript?: string
  error?: string
}

interface GeneratedScript {
  name: string
  description: string
  sections: Array<{
    name: string
    instructions: string
    tips: string
  }>
  full_script: string
  criteria: Array<{
    name: string
    description: string
  }>
  explanation: string
}

type BuilderStep = "input" | "processing" | "preview" | "confirm"

const LLM_MODELS = [
  { value: "openai/gpt-4o-mini", label: "OpenAI GPT-4o Mini (Fast & Cheap)" },
  { value: "google/gemini-2.5-flash", label: "Google Gemini 2.5 Flash (Balanced)" },
  { value: "google/gemini-2.5-pro", label: "Google Gemini 2.5 Pro (Powerful)" },
]

export default function ScriptBuilderPage() {
  const router = useRouter()

  const [step, setStep] = useState<BuilderStep>("input")
  const [inputType, setInputType] = useState<"audio" | "text">("audio")
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([])
  const [textInput, setTextInput] = useState("")
  const [progress, setProgress] = useState(0)
  const [processingStatus, setProcessingStatus] = useState("")
  const [generatedScript, setGeneratedScript] = useState<GeneratedScript | null>(null)
  const [editedName, setEditedName] = useState("")
  const [editedDescription, setEditedDescription] = useState("")
  const [saving, setSaving] = useState(false)

  // Confirm step state
  const [confirmSections, setConfirmSections] = useState<Array<{ name: string; instructions: string; tips: string }>>([])
  const [confirmCriteria, setConfirmCriteria] = useState<Array<{ name: string; description: string }>>([])
  const [confirmLlmModel, setConfirmLlmModel] = useState("openai/gpt-4o-mini")
  const [confirmSystemPrompt, setConfirmSystemPrompt] = useState("")

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const remainingSlots = 3 - audioFiles.length
      const newFiles = acceptedFiles.slice(0, remainingSlots).map((file) => ({
        file,
        name: file.name,
        status: "pending" as const,
      }))
      setAudioFiles((prev) => [...prev, ...newFiles])
    },
    [audioFiles.length]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "audio/*": [".mp3", ".wav", ".m4a", ".webm", ".ogg"],
    },
    maxFiles: 3 - audioFiles.length,
    disabled: audioFiles.length >= 3,
  })

  const removeFile = (index: number) => {
    setAudioFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const processAudioFiles = async (): Promise<string[]> => {
    const transcripts: string[] = []

    for (let i = 0; i < audioFiles.length; i++) {
      const audioFile = audioFiles[i]

      // Update status to uploading
      setAudioFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: "uploading" } : f))
      )
      setProcessingStatus(`Uploading audio ${i + 1} of ${audioFiles.length}...`)
      setProgress(((i * 2) / (audioFiles.length * 3)) * 100)

      try {
        // Sanitize filename (same pattern as upload call)
        const sanitizedName = audioFile.file.name
          .replace(/[^a-zA-Z0-9.-]/g, "_")
          .replace(/\.\.+/g, ".")
        const timestamp = Date.now()
        const blobName = `${timestamp}_${sanitizedName}`

        // Upload directly from client to Vercel Blob (no 4MB limit)
        const blob = await upload(blobName, audioFile.file, {
          access: "public",
          handleUploadUrl: "/api/blob-token",
        })

        const blobUrl = blob.url

        // Update status to transcribing
        setAudioFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: "transcribing" } : f))
        )
        setProcessingStatus(`Transcribing audio ${i + 1} of ${audioFiles.length}...`)
        setProgress(((i * 2 + 1) / (audioFiles.length * 3)) * 100)

        // Transcribe using same pattern as upload call
        const transcribeRes = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blobUrl, filename: audioFile.file.name }),
        })

        if (!transcribeRes.ok) {
          throw new Error("Transcription failed")
        }

        const { transcript } = await transcribeRes.json()
        transcripts.push(transcript)

        // Update status to done
        setAudioFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: "done", transcript } : f
          )
        )
        setProgress(((i * 2 + 2) / (audioFiles.length * 3)) * 100)
      } catch (error) {
        setAudioFiles((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? { ...f, status: "error", error: error instanceof Error ? error.message : "Unknown error" }
              : f
          )
        )
      }
    }

    return transcripts
  }

  const handleGenerate = async () => {
    setStep("processing")
    setProgress(0)

    try {
      let transcripts: string[] = []

      // Process audio files if any
      if (audioFiles.length > 0) {
        transcripts = await processAudioFiles()
      }

      // Generate script
      setProcessingStatus("Analyzing content and generating script...")
      setProgress(80)

      const generateRes = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcripts,
          textInput: textInput.trim() || null,
        }),
      })

      if (!generateRes.ok) {
        const error = await generateRes.json()
        throw new Error(error.error || "Failed to generate script")
      }

      const script = await generateRes.json()
      setGeneratedScript(script)
      setEditedName(script.name)
      setEditedDescription(script.description)
      setProgress(100)
      setStep("preview")
    } catch (error) {
      console.error("[v0] Generation error:", error)
      setProcessingStatus(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    }
  }

  const handleSaveAsRubric = async () => {
    if (!generatedScript) return

    setSaving(true)
    try {
      // Busca rubric ativa via MSW
      const rubricRes = await fetch("/api/rubric-config")
      const { data: rubricData } = (await rubricRes.json()) as { data: { id: string } | null; error: unknown }
      const rubricId = rubricData?.id ?? 'rubric-001'

      // Cria o script via MSW
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rubric_id: rubricId,
          name: editedName,
          description: editedDescription,
          sections: generatedScript.sections,
          full_script: generatedScript.full_script,
          criteria: generatedScript.criteria,
          is_active: true,
        }),
      })
      if (!res.ok) throw new Error("Failed to save script")

      router.push("/dashboard/settings")
    } catch (error) {
      console.error("[v0] Save error:", error)
    }
    setSaving(false)
  }

  const canGenerate =
    audioFiles.length > 0 || textInput.trim().length > 50

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Script Builder</h1>
        <p className="text-muted-foreground">
          Generate a structured sales script from audio recordings or text
        </p>
      </div>

      {step === "input" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Create Your Script
            </CardTitle>
            <CardDescription>
              Upload up to 3 audio recordings of successful calls, paste existing script text, or combine both
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs value={inputType} onValueChange={(v) => setInputType(v as "audio" | "text")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="audio" className="flex items-center gap-2">
                  <FileAudio className="h-4 w-4" />
                  Audio Files
                </TabsTrigger>
                <TabsTrigger value="text" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Text Input
                </TabsTrigger>
              </TabsList>

              <TabsContent value="audio" className="space-y-4 mt-4">
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? "border-primary bg-primary/5"
                      : audioFiles.length >= 3
                      ? "border-muted bg-muted/20 cursor-not-allowed"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <input {...getInputProps()} />
                  <FileAudio className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  {audioFiles.length >= 3 ? (
                    <p className="text-muted-foreground">Maximum 3 files reached</p>
                  ) : isDragActive ? (
                    <p className="text-primary">Drop your audio files here</p>
                  ) : (
                    <>
                      <p className="text-foreground font-medium">
                        Drag & drop audio files here
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        or click to browse (up to {3 - audioFiles.length} more)
                      </p>
                    </>
                  )}
                </div>

                {audioFiles.length > 0 && (
                  <div className="space-y-2">
                    <Label>Selected Files ({audioFiles.length}/3)</Label>
                    {audioFiles.map((audioFile, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                      >
                        <div className="flex items-center gap-3">
                          <FileAudio className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">{audioFile.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(audioFile.file.size / (1024 * 1024)).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="text" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Paste your script or call transcript</Label>
                  <Textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Paste your existing sales script, call transcript, or notes about your sales process here..."
                    className="min-h-64 font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {textInput.length} characters (minimum 50 recommended)
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            {/* Combined inputs indicator */}
            {audioFiles.length > 0 && textInput.trim().length > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm">
                  Combining {audioFiles.length} audio file{audioFiles.length > 1 ? "s" : ""} with text input for better results
                </p>
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="w-full"
              size="lg"
            >
              <Wand2 className="mr-2 h-5 w-5" />
              Generate Script
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "processing" && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <div>
                <p className="font-medium">{processingStatus}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This may take a minute...
                </p>
              </div>
              <Progress value={progress} className="w-full max-w-md" />

              {/* Show file statuses */}
              {audioFiles.length > 0 && (
                <div className="w-full max-w-md space-y-2 mt-4">
                  {audioFiles.map((audioFile, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 rounded bg-card border text-sm"
                    >
                      <span className="truncate">{audioFile.name}</span>
                      <Badge
                        variant={
                          audioFile.status === "done"
                            ? "default"
                            : audioFile.status === "error"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {audioFile.status === "done" && <CheckCircle className="h-3 w-3 mr-1" />}
                        {audioFile.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && generatedScript && (
        <div className="space-y-6">
          {/* Explanation Card */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <Lightbulb className="h-5 w-5" />
                Why This Script Works
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{generatedScript.explanation}</p>
            </CardContent>
          </Card>

          {/* Script Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Generated Script</CardTitle>
              <CardDescription>
                Review and edit before saving as a rubric
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Editable name and description */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Script Name</Label>
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                  />
                </div>
              </div>

              {/* Sections */}
              <div className="space-y-4">
                <Label>Sections ({generatedScript.sections.length})</Label>
                {generatedScript.sections.map((section, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-lg border bg-card space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{index + 1}</Badge>
                      <h4 className="font-semibold">{section.name}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {section.instructions}
                    </p>
                    {section.tips && (
                      <p className="text-xs text-primary bg-primary/10 p-2 rounded">
                        Tip: {section.tips}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Full Script */}
              <div className="space-y-2">
                <Label>Full Script</Label>
                <div className="p-4 rounded-lg border bg-muted text-foreground max-h-64 overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    {generatedScript.full_script}
                  </pre>
                </div>
              </div>

              {/* Criteria */}
              <div className="space-y-2">
                <Label>Auto-Generated Evaluation Criteria ({generatedScript.criteria.length})</Label>
                <div className="grid gap-2 md:grid-cols-2">
                  {generatedScript.criteria.map((criterion, index) => (
                    <div
                      key={index}
                      className="p-3 rounded-lg border bg-card"
                    >
                      <p className="font-medium text-sm">{criterion.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {criterion.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={async () => {
                    // Load rubric system prompt and llm model
                    const rubricRes = await fetch("/api/rubric-config")
                    const { data: rubricData } = (await rubricRes.json()) as { data: { system_prompt?: string; llm_model?: string } | null; error: unknown }
                    setConfirmSystemPrompt(rubricData?.system_prompt || "")
                    setConfirmLlmModel(rubricData?.llm_model || "openai/gpt-4o-mini")
                    setConfirmSections(generatedScript.sections)
                    setConfirmCriteria(generatedScript.criteria)
                    setStep("confirm")
                  }}
                  className="flex-1"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Create Rubric
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("input")
                    setGeneratedScript(null)
                    setAudioFiles([])
                    setTextInput("")
                  }}
                >
                  Start Over
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === "confirm" && generatedScript && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setStep("preview")}>
              ← Back to Preview
            </Button>
            <div>
              <h2 className="text-xl font-bold">Finalize Rubric</h2>
              <p className="text-sm text-muted-foreground">Review all settings before saving</p>
            </div>
          </div>

          {/* Script Name & Description */}
          <Card>
            <CardHeader>
              <CardTitle>Script Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Script Name</Label>
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className="min-h-20"
                />
              </div>
            </CardContent>
          </Card>

          {/* LLM & System Prompt */}
          <Card>
            <CardHeader>
              <CardTitle>AI Configuration</CardTitle>
              <CardDescription>LLM model and system prompt inherited from your active rubric</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>LLM Model for Analysis</Label>
                <select
                  value={confirmLlmModel}
                  onChange={(e) => setConfirmLlmModel(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                >
                  {LLM_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>System Prompt</Label>
                <Textarea
                  value={confirmSystemPrompt}
                  onChange={(e) => setConfirmSystemPrompt(e.target.value)}
                  className="min-h-32 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Sections */}
          <Card>
            <CardHeader>
              <CardTitle>Script Sections</CardTitle>
              <CardDescription>Edit instructions and tips per section</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {confirmSections.map((section, idx) => (
                <div key={idx} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{idx + 1}</Badge>
                    <Input
                      value={section.name}
                      onChange={(e) => {
                        const updated = [...confirmSections]
                        updated[idx].name = e.target.value
                        setConfirmSections(updated)
                      }}
                      className="font-semibold"
                      placeholder="Section name"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmSections(confirmSections.filter((_, i) => i !== idx))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    value={section.instructions}
                    onChange={(e) => {
                      const updated = [...confirmSections]
                      updated[idx].instructions = e.target.value
                      setConfirmSections(updated)
                    }}
                    className="min-h-20 text-sm"
                    placeholder="Instructions for this section"
                  />
                  <Input
                    value={section.tips}
                    onChange={(e) => {
                      const updated = [...confirmSections]
                      updated[idx].tips = e.target.value
                      setConfirmSections(updated)
                    }}
                    placeholder="Tips (optional)"
                    className="text-sm"
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmSections([...confirmSections, { name: "", instructions: "", tips: "" }])}
              >
                + Add Section
              </Button>
            </CardContent>
          </Card>

          {/* Criteria */}
          <Card>
            <CardHeader>
              <CardTitle>Auto-Generated Criteria</CardTitle>
              <CardDescription>Edit or remove evaluation criteria</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {confirmCriteria.map((criterion, idx) => (
                <div key={idx} className="flex gap-2 items-start p-3 border rounded-lg">
                  <div className="flex-1 space-y-1">
                    <Input
                      value={criterion.name}
                      onChange={(e) => {
                        const updated = [...confirmCriteria]
                        updated[idx].name = e.target.value
                        setConfirmCriteria(updated)
                      }}
                      className="font-medium text-sm"
                      placeholder="Criterion name"
                    />
                    <Input
                      value={criterion.description}
                      onChange={(e) => {
                        const updated = [...confirmCriteria]
                        updated[idx].description = e.target.value
                        setConfirmCriteria(updated)
                      }}
                      className="text-xs text-muted-foreground"
                      placeholder="Description"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmCriteria(confirmCriteria.filter((_, i) => i !== idx))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmCriteria([...confirmCriteria, { name: "", description: "" }])}
              >
                + Add Criterion
              </Button>
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex gap-3 pb-16 lg:pb-0">
            <Button
              onClick={async () => {
                if (!editedName) return
                setSaving(true)
                try {
                  const rubricRes = await fetch("/api/rubric-config")
                  const { data: rubricData } = (await rubricRes.json()) as { data: { id: string } | null; error: unknown }
                  const rubricId = rubricData?.id ?? 'rubric-001'

                  const fullScriptText = confirmSections
                    .map((s, i) => `${i + 1}. ${s.name}\n${s.instructions}${s.tips ? "\nTip: " + s.tips : ""}`)
                    .join("\n\n")

                  await fetch("/api/scripts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      rubric_id: rubricId,
                      name: editedName,
                      description: editedDescription,
                      sections: confirmSections,
                      full_script: fullScriptText,
                      criteria: confirmCriteria,
                      is_active: true,
                    }),
                  })

                  router.push("/dashboard/settings")
                } catch (err) {
                  console.error("[v0] Save rubric error:", err)
                }
                setSaving(false)
              }}
              disabled={saving || !editedName}
              className="flex-1"
              size="lg"
            >
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                <><Save className="mr-2 h-4 w-4" /> Save Rubric</>
              )}
            </Button>
            <Button variant="outline" onClick={() => setStep("preview")} size="lg">
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
