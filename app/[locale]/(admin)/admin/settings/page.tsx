"use client"

import { useState, useEffect } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Pencil, Save, X, Plus, Loader2, Zap, Trash2 } from "lucide-react"

interface GeneratedCriteria {
  name: string
  description: string
}

interface ScriptSection {
  name: string
  instructions: string
  tips: string
}

interface Script {
  id: string
  name: string
  description: string
  sections: ScriptSection[]
  criteria?: GeneratedCriteria[]
  is_active: boolean
  created_at?: string
  full_script?: string
}

interface Rubric {
  id: string
  name: string
  description: string
  is_active: boolean
  system_prompt?: string
  llm_model?: string
}

export default function AdminSettingsPage() {
  const t = useTranslations("Dashboard.settings")
  const locale = useLocale()
  const [scripts, setScripts] = useState<Script[]>([])
  const [rubric, setRubric] = useState<Rubric | null>(null)
  const [systemPrompt, setSystemPrompt] = useState("")
  const [llmModel, setLlmModel] = useState("openai/gpt-4o-mini")
  const [systemPromptEdited, setSystemPromptEdited] = useState(false)
  const [llmModelEdited, setLlmModelEdited] = useState(false)
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null)
  const [editingScriptName, setEditingScriptName] = useState("")
  const [editingScriptContent, setEditingScriptContent] = useState<string>("")
  const [isEditingContent, setIsEditingContent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creatingScript, setCreatingScript] = useState(false)
  const [newScriptForm, setNewScriptForm] = useState({
    name: "",
    description: "",
    sections: [{ name: "", instructions: "", tips: "", weight: 0, critical: false }],
  })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [rubricRes, scriptsRes] = await Promise.all([
      fetch("/api/rubric?config=true"),
      fetch("/api/scripts", { headers: { "x-locale": locale } }),
    ])
    const { data: rubricData } = (await rubricRes.json()) as {
      data: { rubric: Rubric; criteria: unknown[] } | null
      error: unknown
    }
    const { data: scriptsData } = (await scriptsRes.json()) as { data: Script[] | null; error: unknown }

    if (rubricData?.rubric) {
      setRubric(rubricData.rubric)
      setSystemPrompt(rubricData.rubric.system_prompt || "")
      setLlmModel(rubricData.rubric.llm_model || "openai/gpt-4o")
    }
    if (scriptsData) setScripts(scriptsData)
    setLoading(false)
  }

  async function generateCriteriaForScript(scriptDescription: string, sections: ScriptSection[]) {
    try {
      const res = await fetch("/api/generate-criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptDescription, scriptSections: sections }),
      })
      if (!res.ok) throw new Error("Failed to generate criteria")
      const data = await res.json()
      return data.criteria
    } catch (error) {
      console.error("[v0] Error generating criteria:", error)
      return []
    }
  }

  async function handleCreateScript() {
    if (!newScriptForm.name || !newScriptForm.description || !rubric) return

    setCreatingScript(true)
    try {
      const generatedCriteria = await generateCriteriaForScript(
        newScriptForm.description,
        newScriptForm.sections.filter((s) => s.name)
      )

      const filteredSections = newScriptForm.sections.filter((s) => s.name)
      const fullScriptText = filteredSections
        .map((s, i) => `${i + 1}. ${s.name}\n${s.instructions}${s.tips ? "\nTip: " + s.tips : ""}`)
        .join("\n\n")

      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rubric_id: rubric.id,
          name: newScriptForm.name,
          description: newScriptForm.description,
          sections: filteredSections,
          full_script: fullScriptText,
          criteria: generatedCriteria,
          is_active: true,
        }),
      })
      const { data: scriptData } = (await res.json()) as { data: Script | null; error: unknown }

      if (scriptData) {
        // Recarrega via GET (que traduz os critérios por locale) em vez de
        // inserir otimisticamente os critérios recém-gerados em inglês.
        await fetchData()
        setNewScriptForm({ name: "", description: "", sections: [{ name: "", instructions: "", tips: "", weight: 0, critical: false }] })
      }
    } catch (error) {
      console.error("[v0] Error creating script:", error)
    }
    setCreatingScript(false)
  }

  async function handleUpdateSystemPrompt() {
    if (!rubric) return

    setSaving(true)
    await fetch("/api/rubric", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt: systemPrompt, llmModel: llmModel }),
    })
    setSystemPromptEdited(false)
    setLlmModelEdited(false)
    setSaving(false)
  }

  async function handleUpdateScriptName(scriptId: string, newName: string) {
    const res = await fetch(`/api/scripts/${scriptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    })
    if (res.ok) {
      setScripts(scripts.map((s) => (s.id === scriptId ? { ...s, name: newName } : s)))
      setEditingScriptId(null)
      setEditingScriptName("")
    }
  }

  async function handleUpdateScriptContent(scriptId: string, content: string) {
    const res = await fetch(`/api/scripts/${scriptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_script: content }),
    })
    if (res.ok) {
      setScripts(scripts.map((s) => (s.id === scriptId ? { ...s, full_script: content } : s)))
      setIsEditingContent(false)
    }
  }

  function getScriptDisplayText(script: Script): string {
    if (script.full_script) return script.full_script
    return script.sections
      .map((s, i) => `${i + 1}. ${s.name}\n${s.instructions}${s.tips ? "\nTip: " + s.tips : ""}`)
      .join("\n\n")
  }

  async function handleDeleteScript(scriptId: string) {
    const res = await fetch(`/api/scripts/${scriptId}`, { method: "DELETE" })
    if (res.ok) {
      setScripts(scripts.filter((s) => s.id !== scriptId))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-16 lg:pb-0">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("subtitle")}</p>
      </div>

      {/* System Prompt Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t("systemPromptTitle")}</CardTitle>
          <CardDescription>{t("systemPromptDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("llmModelLabel")}</Label>
            <select
              value={llmModel}
              onChange={(e) => {
                setLlmModel(e.target.value)
                setLlmModelEdited(true)
              }}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            >
              <option value="google/gemini-2.5-flash">{t("llmOptionGemini25Flash")}</option>
              <option value="google/gemini-2.5-pro">{t("llmOptionGemini25Pro")}</option>
              <option value="google/gemini-2.0-flash">{t("llmOptionGemini20Flash")}</option>
              <option value="google/gemini-2.0-flash-lite">{t("llmOptionGemini20FlashLite")}</option>
            </select>
            <p className="text-xs text-muted-foreground">{t("llmModelHint")}</p>
          </div>

          <div className="space-y-2">
            <Label>{t("systemPromptLabel")}</Label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => {
                setSystemPrompt(e.target.value)
                setSystemPromptEdited(true)
              }}
              placeholder={t("systemPromptPlaceholder")}
              className="min-h-32"
            />
            <p className="text-xs text-muted-foreground">{t("systemPromptFieldHint")}</p>
          </div>

          {(systemPromptEdited || llmModelEdited) && (
            <Button onClick={handleUpdateSystemPrompt} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("saving")}
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {t("saveChanges")}
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Scripts Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{t("scriptsTitle")}</h2>
          <Button onClick={() => setCreatingScript(!creatingScript)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("newScript")}
          </Button>
        </div>

        {/* Create New Script Form */}
        {creatingScript && (
          <Card className="border-blue-500">
            <CardHeader>
              <CardTitle>{t("createScriptTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>{t("scriptNameLabel")}</Label>
                <Input
                  value={newScriptForm.name}
                  onChange={(e) => setNewScriptForm({ ...newScriptForm, name: e.target.value })}
                  placeholder={t("scriptNamePlaceholder")}
                />
              </div>

              <div>
                <Label>{t("descriptionLabel")}</Label>
                <Textarea
                  value={newScriptForm.description}
                  onChange={(e) => setNewScriptForm({ ...newScriptForm, description: e.target.value })}
                  placeholder={t("descriptionPlaceholder")}
                  className="min-h-24"
                />
              </div>

              <div>
                <Label>{t("scriptSectionsLabel")}</Label>
                <div className="space-y-3 mt-2">
                  {newScriptForm.sections.map((section, idx) => (
                    <div key={idx} className="p-3 border rounded-lg space-y-2">
                      <Input
                        placeholder={t("sectionNamePlaceholder")}
                        value={section.name}
                        onChange={(e) => {
                          const updated = [...newScriptForm.sections]
                          updated[idx].name = e.target.value
                          setNewScriptForm({ ...newScriptForm, sections: updated })
                        }}
                      />
                      <Textarea
                        placeholder={t("sectionInstructionsPlaceholder")}
                        value={section.instructions}
                        onChange={(e) => {
                          const updated = [...newScriptForm.sections]
                          updated[idx].instructions = e.target.value
                          setNewScriptForm({ ...newScriptForm, sections: updated })
                        }}
                        className="min-h-20"
                      />
                      <Input
                        placeholder={t("sectionTipsPlaceholder")}
                        value={section.tips}
                        onChange={(e) => {
                          const updated = [...newScriptForm.sections]
                          updated[idx].tips = e.target.value
                          setNewScriptForm({ ...newScriptForm, sections: updated })
                        }}
                      />
                      <div className="flex items-center gap-4 pt-1">
                        <div className="flex items-center gap-2 flex-1">
                          <Label className="text-xs whitespace-nowrap">{t('weightLabel')}</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={section.weight}
                            onChange={(e) => {
                              const updated = [...newScriptForm.sections]
                              updated[idx].weight = Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                              setNewScriptForm({ ...newScriptForm, sections: updated })
                            }}
                            className="text-sm w-20"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={section.critical}
                            onChange={(e) => {
                              const updated = [...newScriptForm.sections]
                              updated[idx].critical = e.target.checked
                              setNewScriptForm({ ...newScriptForm, sections: updated })
                            }}
                            className="rounded"
                          />
                          <span className="font-medium text-destructive">{t('critical')}</span>
                          <span className="text-muted-foreground">{t('criticalHint')}</span>
                        </label>
                      </div>
                    </div>
                  ))}
                  {(() => {
                    const validSections = newScriptForm.sections.filter((s) => s.name)
                    const total = validSections.reduce((sum, s) => sum + (s.weight || 0), 0)
                    if (validSections.length === 0) return null
                    return total !== 100 ? (
                      <p className="text-xs text-destructive font-medium">
                        {t('weightsSumInvalid', { total })}
                      </p>
                    ) : (
                      <p className="text-xs text-green-500 font-medium">{t('weightsSumValid')}</p>
                    )
                  })()}
                  <Button
                    variant="outline"
                    onClick={() =>
                      setNewScriptForm({
                        ...newScriptForm,
                        sections: [
                          ...newScriptForm.sections,
                          { name: "", instructions: "", tips: "", weight: 0, critical: false },
                        ],
                      })
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t("addSection")}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                {(() => {
                  const validSections = newScriptForm.sections.filter((s) => s.name)
                  const weightTotal = validSections.reduce((sum, s) => sum + (s.weight || 0), 0)
                  const weightInvalid = validSections.length > 0 && weightTotal !== 100
                  return (
                    <Button onClick={handleCreateScript} disabled={!newScriptForm.name || weightInvalid}>
                      <Zap className="mr-2 h-4 w-4" />
                      {t("createAndGenerate")}
                    </Button>
                  )
                })()}
                <Button variant="outline" onClick={() => setCreatingScript(false)}>
                  {t("cancel")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scripts List with Accordion */}
        {scripts.length > 0 ? (
          <Accordion type="single" collapsible className="space-y-2">
            {scripts.map((script) => (
              <Card key={script.id}>
                <AccordionItem value={script.id} className="border-0">
                  {editingScriptId === script.id ? (
                    <div className="flex items-center gap-3 p-4">
                      <div className="flex flex-1 gap-2">
                        <Input
                          autoFocus
                          value={editingScriptName}
                          onChange={(e) => setEditingScriptName(e.target.value)}
                          className="font-semibold h-9"
                        />
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleUpdateScriptName(script.id, editingScriptName)}
                          className="h-9"
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingScriptId(null)
                            setEditingScriptName("")
                          }}
                          className="h-9"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {script.is_active && <Badge>{t("activeBadge")}</Badge>}
                    </div>
                  ) : (
                    <AccordionTrigger className="hover:no-underline p-4">
                      <div className="flex items-center gap-3 text-left flex-1">
                        <div className="flex-1">
                          <div className="space-y-1">
                            <div
                              className="flex items-center gap-2 group cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingScriptId(script.id)
                                setEditingScriptName(script.name)
                              }}
                            >
                              <h3 className="font-semibold text-lg">{script.name}</h3>
                              <Pencil className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {t("createdOn", { date: new Date(script.created_at || "").toLocaleDateString(locale) })}
                            </p>
                            <p className="text-sm text-muted-foreground">{script.description}</p>
                          </div>
                        </div>
                        {script.is_active && <Badge>{t("activeBadge")}</Badge>}
                      </div>
                    </AccordionTrigger>
                  )}

                  <AccordionContent className="pt-0">
                    <div className="space-y-4 p-4 border-t">
                      {/* Complete Script */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold">{t("completeScript")}</h4>
                          {!isEditingContent ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingScriptContent(getScriptDisplayText(script))
                                setIsEditingContent(true)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                        {isEditingContent ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editingScriptContent}
                              onChange={(e) => setEditingScriptContent(e.target.value)}
                              className="font-mono text-xs min-h-64"
                              placeholder={t("editScriptPlaceholder")}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleUpdateScriptContent(script.id, editingScriptContent)}
                              >
                                <Save className="h-4 w-4 mr-1" />
                                {t("save")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setIsEditingContent(false)}
                              >
                                <X className="h-4 w-4 mr-1" />
                                {t("cancel")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 bg-muted rounded border border-border text-foreground">
                            <p className="font-mono text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">
                              {getScriptDisplayText(script)}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Sections */}
                      <div>
                        <h4 className="font-semibold mb-2">{t("scriptSectionsHeading")}</h4>
                        <div className="space-y-2">
                          {script.sections.map((section, idx) => (
                            <div key={idx} className="p-3 bg-muted rounded">
                              <p className="font-medium">{section.name}</p>
                              <p className="text-sm text-muted-foreground">{section.instructions}</p>
                              {section.tips && (
                                <p className="text-xs text-blue-500 mt-1">{t("tipEmoji", { tip: section.tips })}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Generated Criteria */}
                      {script.criteria && script.criteria.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-2">{t("autoGeneratedCriteria")}</h4>
                          <div className="space-y-2">
                            {script.criteria.map((criterion: GeneratedCriteria, idx: number) => (
                              <div key={idx} className="p-3 bg-green-50 dark:bg-green-950 rounded border border-green-200 dark:border-green-800">
                                <p className="font-medium text-green-900 dark:text-green-100">
                                  {criterion.name}
                                </p>
                                <p className="text-sm text-green-700 dark:text-green-300">
                                  {criterion.description}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteScript(script.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("deleteScript")}
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Card>
            ))}
          </Accordion>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              {t("emptyScripts")}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
