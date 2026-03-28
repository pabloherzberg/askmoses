"use client"

import { useState, useEffect } from "react"
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

export default function SettingsPage() {
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
  const [editForm, setEditForm] = useState<Script | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creatingScript, setCreatingScript] = useState(false)
  const [newScriptForm, setNewScriptForm] = useState({
    name: "",
    description: "",
    sections: [{ name: "", instructions: "", tips: "" }],
  })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [rubricRes, scriptsRes] = await Promise.all([
      fetch("/api/rubric-config"),
      fetch("/api/scripts"),
    ])
    const { data: rubricData } = (await rubricRes.json()) as { data: Rubric | null; error: unknown }
    const { data: scriptsData } = (await scriptsRes.json()) as { data: Script[] | null; error: unknown }

    if (rubricData) {
      setRubric(rubricData)
      setSystemPrompt(rubricData.system_prompt || "")
      setLlmModel(rubricData.llm_model || "openai/gpt-4o-mini")
    }
    if (scriptsData) setScripts(scriptsData)
    setLoading(false)
  }

  async function generateCriteriaForScript(scriptDescription: string, sections: ScriptSection[]) {
    try {
      const res = await fetch("/api/generate-criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptDescription,
          scriptSections: sections,
        }),
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
          is_active: false,
        }),
      })
      const { data: scriptData } = (await res.json()) as { data: Script | null; error: unknown }

      if (scriptData) {
        setScripts([...scripts, { ...scriptData, criteria: generatedCriteria }])
        setNewScriptForm({ name: "", description: "", sections: [{ name: "", instructions: "", tips: "" }] })
      }
    } catch (error) {
      console.error("[v0] Error creating script:", error)
    }
    setCreatingScript(false)
  }

  async function handleUpdateSystemPrompt() {
    if (!rubric) return

    setSaving(true)
    await fetch("/api/rubric-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_prompt: systemPrompt, llm_model: llmModel }),
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
      setScripts(
        scripts.map((s) =>
          s.id === scriptId ? { ...s, full_script: content } : s
        )
      )
      setIsEditingContent(false)
    }
  }

  function getScriptDisplayText(script: Script): string {
    if (script.full_script) return script.full_script
    // Fallback: build from sections if full_script not saved yet
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
        <h1 className="text-3xl font-bold">Coaching Configuration</h1>
        <p className="text-muted-foreground mt-2">
          Manage your sales scripts and coaching system
        </p>
      </div>

      {/* System Prompt Section */}
      <Card>
        <CardHeader>
          <CardTitle>System Prompt</CardTitle>
          <CardDescription>
            Customize the AI coaching instructions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>LLM Model for Analysis</Label>
            <select
              value={llmModel}
              onChange={(e) => {
                setLlmModel(e.target.value)
                setLlmModelEdited(true)
              }}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            >
              <option value="openai/gpt-4o-mini">OpenAI GPT-4o Mini (Fast & Cheap)</option>
              <option value="google/gemini-2.5-flash">Google Gemini 2.5 Flash (Balanced)</option>
              <option value="google/gemini-2.5-pro">Google Gemini 2.5 Pro (Powerful)</option>
            </select>
            <p className="text-xs text-muted-foreground">Choose the AI model to use for analyzing sales calls</p>
          </div>

          <div className="space-y-2">
            <Label>System Prompt</Label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => {
                setSystemPrompt(e.target.value)
                setSystemPromptEdited(true)
              }}
              placeholder="Enter the system prompt for AI analysis..."
              className="min-h-32"
            />
            <p className="text-xs text-muted-foreground">Customize the AI coaching instructions</p>
          </div>

          {(systemPromptEdited || llmModelEdited) && (
            <Button onClick={handleUpdateSystemPrompt} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Scripts Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Sales Scripts</h2>
          <Button onClick={() => setCreatingScript(!creatingScript)}>
            <Plus className="mr-2 h-4 w-4" />
            New Script
          </Button>
        </div>

        {/* Create New Script Form */}
        {creatingScript && (
          <Card className="border-blue-500">
            <CardHeader>
              <CardTitle>Create New Sales Script</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Script Name</Label>
                <Input
                  value={newScriptForm.name}
                  onChange={(e) =>
                    setNewScriptForm({ ...newScriptForm, name: e.target.value })
                  }
                  placeholder="e.g., Dog Training Consultation"
                />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={newScriptForm.description}
                  onChange={(e) =>
                    setNewScriptForm({ ...newScriptForm, description: e.target.value })
                  }
                  placeholder="Describe the sales process and key objectives..."
                  className="min-h-24"
                />
              </div>

              <div>
                <Label>Script Sections</Label>
                <div className="space-y-3 mt-2">
                  {newScriptForm.sections.map((section, idx) => (
                    <div key={idx} className="p-3 border rounded-lg space-y-2">
                      <Input
                        placeholder="Section name (e.g., Greeting)"
                        value={section.name}
                        onChange={(e) => {
                          const updated = [...newScriptForm.sections]
                          updated[idx].name = e.target.value
                          setNewScriptForm({ ...newScriptForm, sections: updated })
                        }}
                      />
                      <Textarea
                        placeholder="Instructions for this section"
                        value={section.instructions}
                        onChange={(e) => {
                          const updated = [...newScriptForm.sections]
                          updated[idx].instructions = e.target.value
                          setNewScriptForm({ ...newScriptForm, sections: updated })
                        }}
                        className="min-h-20"
                      />
                      <Input
                        placeholder="Tips (optional)"
                        value={section.tips}
                        onChange={(e) => {
                          const updated = [...newScriptForm.sections]
                          updated[idx].tips = e.target.value
                          setNewScriptForm({ ...newScriptForm, sections: updated })
                        }}
                      />
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() =>
                      setNewScriptForm({
                        ...newScriptForm,
                        sections: [
                          ...newScriptForm.sections,
                          { name: "", instructions: "", tips: "" },
                        ],
                      })
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Section
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleCreateScript} disabled={!newScriptForm.name}>
                  <Zap className="mr-2 h-4 w-4" />
                  Create & Generate Criteria
                </Button>
                <Button variant="outline" onClick={() => setCreatingScript(false)}>
                  Cancel
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
                  <AccordionTrigger className="hover:no-underline p-4">
                    <div className="flex items-center gap-3 text-left flex-1">
                      <div className="flex-1">
                        {editingScriptId === script.id ? (
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <Input
                              autoFocus
                              value={editingScriptName}
                              onChange={(e) => setEditingScriptName(e.target.value)}
                              className="font-semibold h-9"
                            />
                            <Button
                              size="sm"
                              variant="default"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleUpdateScriptName(script.id, editingScriptName)
                              }}
                              className="h-9"
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingScriptId(null)
                                setEditingScriptName("")
                              }}
                              className="h-9"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
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
                              Created {new Date(script.created_at || "").toLocaleDateString()}
                            </p>
                            <p className="text-sm text-muted-foreground">{script.description}</p>
                          </div>
                        )}
                      </div>
                      {script.is_active && <Badge>Active</Badge>}
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="pt-0">
                    <div className="space-y-4 p-4 border-t">
                      {/* Complete Script */}
                      <div>
                          <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold">Complete Script</h4>
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
                              placeholder="Edit script content..."
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleUpdateScriptContent(script.id, editingScriptContent)}
                              >
                                <Save className="h-4 w-4 mr-1" />
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setIsEditingContent(false)}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 bg-slate-900 dark:bg-slate-800 rounded border border-slate-700 text-slate-100">
                            <p className="font-mono text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">
                              {getScriptDisplayText(script)}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Sections */}
                      <div>
                        <h4 className="font-semibold mb-2">Script Sections</h4>
                        <div className="space-y-2">
                          {script.sections.map((section, idx) => (
                            <div key={idx} className="p-3 bg-muted rounded">
                              <p className="font-medium">{section.name}</p>
                              <p className="text-sm text-muted-foreground">{section.instructions}</p>
                              {section.tips && (
                                <p className="text-xs text-blue-500 mt-1">💡 {section.tips}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Generated Criteria */}
                      {script.criteria && script.criteria.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-2">Auto-Generated Criteria</h4>
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
                        Delete Script
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
              No scripts created yet. Create your first sales script to get started.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
