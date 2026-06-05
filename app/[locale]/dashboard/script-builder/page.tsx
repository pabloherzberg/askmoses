"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { upload } from "@vercel/blob/client"
import { useRouter } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
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

// F4 — as 5 seções fixas, sempre nesta ordem, imutáveis
const FIXED_SECTIONS = [
  { name: "Discovery" },
  { name: "Problem Agitation" },
  { name: "Offer Presentation" },
  { name: "Objection Handling" },
  { name: "Close & Next Steps" },
]

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
    weight: number
    critical: boolean
  }>
  full_script: string
  explanation: string
}

type BuilderStep = "input" | "processing" | "preview" | "confirm"

// F4 — seções do preview/confirm: nome fixo + conteúdo preenchido pela IA
type FixedSection = {
  name: string
  instructions: string
  tips: string
  weight: number
  critical: boolean
}

export default function ScriptBuilderPage() {
  const router = useRouter()
  const t = useTranslations("Dashboard.scriptBuilder")
  const locale = useLocale()

  const LLM_MODELS = [
    { value: "openai/gpt-4o-mini", label: t("llmModels.gpt4oMini") },
    { value: "google/gemini-2.5-flash", label: t("llmModels.gemini25Flash") },
    { value: "google/gemini-2.5-pro", label: t("llmModels.gemini25Pro") },
  ]

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

  // F2/F3 — preview: só seções fixas, sem criteria, sem enabled
  const [previewSections, setPreviewSections] = useState<FixedSection[]>([])

  // Confirm step state
  const [confirmSections, setConfirmSections] = useState<FixedSection[]>([])
  const [confirmLlmModel, setConfirmLlmModel] = useState("openai/gpt-4o-mini")
  const [confirmSystemPrompt, setConfirmSystemPrompt] = useState("")
  const [rubrics, setRubrics] = useState<Array<{ id: string; name: string }>>([])
  const [selectedRubricId, setSelectedRubricId] = useState<string>("")

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

      setAudioFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: "uploading" } : f))
      )
      setProcessingStatus(t("processing.uploadingAudio", { current: i + 1, total: audioFiles.length }))
      setProgress(((i * 2) / (audioFiles.length * 3)) * 100)

      try {
        const sanitizedName = audioFile.file.name
          .replace(/[^a-zA-Z0-9.-]/g, "_")
          .replace(/\.\.+/g, ".")
        const timestamp = Date.now()
        const blobName = `${timestamp}_${sanitizedName}`

        const blob = await upload(blobName, audioFile.file, {
          access: "public",
          handleUploadUrl: "/api/blob-token",
        })

        const blobUrl = blob.url

        setAudioFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: "transcribing" } : f))
        )
        setProcessingStatus(t("processing.transcribingAudio", { current: i + 1, total: audioFiles.length }))
        setProgress(((i * 2 + 1) / (audioFiles.length * 3)) * 100)

        const transcribeRes = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blobUrl, filename: audioFile.file.name }),
        })

        if (!transcribeRes.ok) {
          throw new Error(t("processing.transcriptionFailed"))
        }

        const { transcript } = await transcribeRes.json()
        transcripts.push(transcript)

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
              ? { ...f, status: "error", error: error instanceof Error ? error.message : t("processing.unknownError") }
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

      if (audioFiles.length > 0) {
        transcripts = await processAudioFiles()
      }

      setProcessingStatus(t("processing.analyzing"))
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
        throw new Error(error.error || t("processing.generateFailed"))
      }

      const script = await generateRes.json()
      setGeneratedScript(script)
      setEditedName(script.name)
      setEditedDescription(script.description)

      // F4 — ignorar seções da IA, sempre usar FIXED_SECTIONS.
      // Mapear instructions/tips da IA por nome de seção quando disponível.
      const aiByName = new Map<string, GeneratedScript["sections"][number]>(
        (script.sections ?? []).map((s: GeneratedScript["sections"][number]) => [
          s.name.toLowerCase(),
          s,
        ])
      )
      const fixed: FixedSection[] = FIXED_SECTIONS.map((fs) => {
        const ai = aiByName.get(fs.name.toLowerCase())
        return {
          name: fs.name,
          instructions: ai?.instructions ?? "",
          tips: ai?.tips ?? "",
          weight: ai?.weight ?? 20,
          critical: ai?.critical ?? false,
        }
      })
      setPreviewSections(fixed)

      setProgress(100)
      setStep("preview")
    } catch (error) {
      console.error("[v0] Generation error:", error)
      setProcessingStatus(
        t("processing.errorPrefix", { message: error instanceof Error ? error.message : t("processing.unknownError") })
      )
    }
  }

  const handleSaveAsRubric = async () => {
    if (!generatedScript) return

    setSaving(true)
    try {
      const rubricRes = await fetch("/api/rubric?config=true")
      const { data: rubricData } = (await rubricRes.json()) as { data: { id: string } | null; error: unknown }
      if (!rubricData?.id) throw new Error(t("confirm.saveFailed"))
      const rubricId = rubricData.id

      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rubric_id: rubricId,
          name: editedName,
          description: editedDescription,
          sections: generatedScript.sections,
          full_script: generatedScript.full_script,
          is_active: true,
        }),
      })
      if (!res.ok) throw new Error(t("confirm.saveFailed"))

      router.push(`/${locale}/dashboard/settings`)
    } catch (error) {
      console.error("[v0] Save error:", error)
    }
    setSaving(false)
  }

  const canGenerate = audioFiles.length > 0 || textInput.trim().length > 50

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {step === "input" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              {t("createCardTitle")}
            </CardTitle>
            <CardDescription>
              {t("createCardDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs value={inputType} onValueChange={(v) => setInputType(v as "audio" | "text")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="audio" className="flex items-center gap-2">
                  <FileAudio className="h-4 w-4" />
                  {t("tabs.audio")}
                </TabsTrigger>
                <TabsTrigger value="text" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t("tabs.text")}
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
                    <p className="text-muted-foreground">{t("dropzone.maxReached")}</p>
                  ) : isDragActive ? (
                    <p className="text-primary">{t("dropzone.dropHere")}</p>
                  ) : (
                    <>
                      <p className="text-foreground font-medium">
                        {t("dropzone.dragAndDrop")}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {(3 - audioFiles.length) === 1
                          ? t("dropzone.orClickOne", { count: 3 - audioFiles.length })
                          : t("dropzone.orClickOther", { count: 3 - audioFiles.length })}
                      </p>
                    </>
                  )}
                </div>

                {audioFiles.length > 0 && (
                  <div className="space-y-2">
                    <Label>{t("selectedFiles", { count: audioFiles.length })}</Label>
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
                              {t("fileSizeMb", { size: (audioFile.file.size / (1024 * 1024)).toFixed(2) })}
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
                  <Label>{t("textTab.label")}</Label>
                  <Textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder={t("textTab.placeholder")}
                    className="min-h-64 font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("textTab.charsCount", { count: textInput.length })}
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            {audioFiles.length > 0 && textInput.trim().length > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm">
                  {audioFiles.length === 1
                    ? t("combinedIndicatorOne", { count: audioFiles.length })
                    : t("combinedIndicatorOther", { count: audioFiles.length })}
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
              {t("generateButton")}
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
                  {t("processing.mayTake")}
                </p>
              </div>
              <Progress value={progress} className="w-full max-w-md" />

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
                        {t(`status.${audioFile.status}`)}
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
                {t("preview.whyItWorks")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{generatedScript.explanation}</p>
            </CardContent>
          </Card>

          {/* Script Preview */}
          <Card>
            <CardHeader>
              <CardTitle>{t("preview.generatedScript")}</CardTitle>
              <CardDescription>
                {t("preview.reviewBeforeSaving")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Editable name and description */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("preview.scriptName")}</Label>
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("preview.description")}</Label>
                  <Input
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                  />
                </div>
              </div>

              {/* F1/F2 — Seções fixas: sem Eye toggle, sem Add Section */}
              <div className="space-y-4">
                <Label>{t("preview.sections", { count: previewSections.length })}</Label>
                {previewSections.map((section, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-lg border bg-card space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{index + 1}</Badge>
                      <h4 className="font-semibold flex-1">{section.name}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {section.instructions}
                    </p>
                    {section.tips && (
                      <p className="text-xs text-primary bg-primary/10 p-2 rounded">
                        {t("preview.tipPrefix", { tip: section.tips })}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Full Script */}
              <div className="space-y-2">
                <Label>{t("preview.fullScript")}</Label>
                <div className="p-4 rounded-lg border bg-muted text-foreground max-h-64 overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    {generatedScript.full_script}
                  </pre>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={async () => {
                    const [rubricRes, rubricListRes] = await Promise.all([
                      fetch("/api/rubric?config=true"),
                      fetch("/api/rubric?list=true"),
                    ])
                    const { data: rubricData } = (await rubricRes.json()) as { data: { id?: string; system_prompt?: string; llm_model?: string } | null; error: unknown }
                    const { data: rubricList } = (await rubricListRes.json()) as { data: Array<{ id: string; name: string }> | null; error: unknown }
                    setConfirmSystemPrompt(rubricData?.system_prompt || "")
                    setConfirmLlmModel(rubricData?.llm_model || "openai/gpt-4o-mini")
                    // F4 — passar as seções fixas para o confirm step
                    setConfirmSections([...previewSections])
                    const list = rubricList ?? []
                    setRubrics(list)
                    setSelectedRubricId(rubricData?.id ?? list[0]?.id ?? "")
                    setStep("confirm")
                  }}
                  className="flex-1"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {t("preview.createRubric")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("input")
                    setGeneratedScript(null)
                    setAudioFiles([])
                    setTextInput("")
                    setPreviewSections([])
                  }}
                >
                  {t("preview.startOver")}
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
              {t("confirm.backToPreview")}
            </Button>
            <div>
              <h2 className="text-xl font-bold">{t("confirm.finalizeRubric")}</h2>
              <p className="text-sm text-muted-foreground">{t("confirm.reviewAllSettings")}</p>
            </div>
          </div>

          {/* Script Name & Description */}
          <Card>
            <CardHeader>
              <CardTitle>{t("confirm.scriptInfo")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("confirm.scriptName")}</Label>
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("confirm.description")}</Label>
                <Textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className="min-h-20"
                />
              </div>
            </CardContent>
          </Card>

          {/* Rubric selector */}
          <Card>
            <CardHeader>
              <CardTitle>{t("confirm.rubricLabel")}</CardTitle>
              <CardDescription>{t("confirm.rubricSubtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              {rubrics.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("confirm.rubricNone")}</p>
              ) : (
                <select
                  value={selectedRubricId}
                  onChange={(e) => setSelectedRubricId(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                >
                  {rubrics.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              )}
            </CardContent>
          </Card>

          {/* F1/F4 — Seções fixas: nome somente leitura, sem botão X, sem Add Section */}
          <Card>
            <CardHeader>
              <CardTitle>{t("confirm.scriptSections")}</CardTitle>
              <CardDescription>{t("confirm.scriptSectionsSubtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {confirmSections.map((section, idx) => (
                <div key={idx} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{idx + 1}</Badge>
                    {/* F4 — nome fixo, só leitura */}
                    <span className="font-semibold flex-1">{section.name}</span>
                  </div>
                  <Textarea
                    value={section.instructions}
                    onChange={(e) => {
                      const updated = [...confirmSections]
                      updated[idx].instructions = e.target.value
                      setConfirmSections(updated)
                    }}
                    className="min-h-20 text-sm"
                    placeholder={t("confirm.sectionInstructionsPlaceholder")}
                  />
                  <Input
                    value={section.tips}
                    onChange={(e) => {
                      const updated = [...confirmSections]
                      updated[idx].tips = e.target.value
                      setConfirmSections(updated)
                    }}
                    placeholder={t("confirm.sectionTipsPlaceholder")}
                    className="text-sm"
                  />
                  <div className="flex items-center gap-4 pt-1">
                    <div className="flex items-center gap-2 flex-1">
                      <Label className="text-xs whitespace-nowrap">Weight (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={section.weight}
                        onChange={(e) => {
                          const updated = [...confirmSections]
                          updated[idx].weight = Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                          setConfirmSections(updated)
                        }}
                        className="text-sm w-20"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={section.critical}
                        onChange={(e) => {
                          const updated = [...confirmSections]
                          updated[idx].critical = e.target.checked
                          setConfirmSections(updated)
                        }}
                        className="rounded"
                      />
                      <span className="font-medium text-destructive">Critical</span>
                      <span className="text-muted-foreground">(score ≤ 4 triggers alert)</span>
                    </label>
                  </div>
                </div>
              ))}
              {(() => {
                const total = confirmSections.reduce((sum, s) => sum + (s.weight || 0), 0)
                return total !== 100 ? (
                  <p className="text-xs text-destructive font-medium">
                    ⚠ Weights sum to {total}% — must equal 100% before saving.
                  </p>
                ) : (
                  <p className="text-xs text-green-500 font-medium">✓ Weights sum to 100%</p>
                )
              })()}
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex gap-3 pb-16 lg:pb-0">
            <Button
              onClick={async () => {
                if (!editedName) return
                if (!selectedRubricId) return
                const weightTotal = confirmSections.reduce((sum, s) => sum + (s.weight || 0), 0)
                if (weightTotal !== 100) return
                setSaving(true)
                try {
                  const rubricId = selectedRubricId

                  const fullScriptText = confirmSections
                    .map((s, i) => `${i + 1}. ${s.name}\n${s.instructions}${s.tips ? "\n" + t("preview.tipPrefix", { tip: s.tips }) : ""}`)
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
                      is_active: true,
                    }),
                  })

                  router.push(`/${locale}/dashboard/settings`)
                } catch (err) {
                  console.error("[v0] Save rubric error:", err)
                }
                setSaving(false)
              }}
              disabled={saving || !editedName || !selectedRubricId || confirmSections.reduce((sum, s) => sum + (s.weight || 0), 0) !== 100}
              className="flex-1"
              size="lg"
            >
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("confirm.saving")}</>
              ) : (
                <><Save className="mr-2 h-4 w-4" /> {t("confirm.saveRubric")}</>
              )}
            </Button>
            <Button variant="outline" onClick={() => setStep("preview")} size="lg">
              {t("confirm.back")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
