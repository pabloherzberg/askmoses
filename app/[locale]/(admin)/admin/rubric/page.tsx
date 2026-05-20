"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Save, Plus, Loader2, Zap, Settings2 } from "lucide-react"

interface Rubric {
  id: string
  name: string
  description: string
  is_active: boolean
  is_default?: boolean
  system_prompt?: string
  llm_model?: string
}

interface Organization {
  id: string
  name: string
}

export default function AdminRubricPage() {
  const t = useTranslations("Dashboard.settings")
  
  const [activeTab, setActiveTab] = useState("manage")
  
  const [rubrics, setRubrics] = useState<Rubric[]>([])
  const [selectedRubricId, setSelectedRubricId] = useState<string>("")
  const [rubric, setRubric] = useState<Rubric | null>(null)
  
  const [systemPrompt, setSystemPrompt] = useState("")
  const [llmModel, setLlmModel] = useState("openai/gpt-4o-mini")
  const [systemPromptEdited, setSystemPromptEdited] = useState(false)
  const [llmModelEdited, setLlmModelEdited] = useState(false)
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [orgs, setOrgs] = useState<Organization[]>([])
  
  const [newRubricForm, setNewRubricForm] = useState({ 
    name: "", 
    description: "",
    orgId: "global",
    systemPrompt: "",
    llmModel: "openai/gpt-4o-mini"
  })

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (!selectedRubricId || rubrics.length === 0) return
    const selected = rubrics.find(r => r.id === selectedRubricId)
    if (selected) {
      setRubric(selected)
      setSystemPrompt(selected.system_prompt || "")
      setLlmModel(selected.llm_model || "openai/gpt-4o")
      setSystemPromptEdited(false)
      setLlmModelEdited(false)
    }
  }, [selectedRubricId, rubrics])

  async function fetchData(forceSelectId?: string) {
    setLoading(true)
    const [rubricsRes, orgsRes] = await Promise.all([
      fetch("/api/rubric?list=true"),
      fetch("/api/admin/organizations/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 200 })
      })
    ])
    
    const { data: rubricsData } = (await rubricsRes.json()) as { data: Rubric[] | null; error: unknown }
    const { data: orgsData } = await orgsRes.json()

    if (orgsData && orgsData.rows) {
      setOrgs(orgsData.rows)
    }

    if (rubricsData && rubricsData.length > 0) {
      setRubrics(rubricsData)
      
      const idToSelect = forceSelectId || selectedRubricId || (rubricsData.find(r => r.is_active && r.is_default)?.id || rubricsData[0].id)
      
      if (idToSelect) {
        setSelectedRubricId(idToSelect)
      }
    }
    setLoading(false)
  }

  async function handleCreateRubric() {
    if (!newRubricForm.name) return

    setSaving(true)
    try {
      const res = await fetch("/api/admin/rubrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newRubricForm,
          orgId: newRubricForm.orgId === "global" ? null : newRubricForm.orgId
        }),
      })
      if (res.ok) {
        const { data: newRubric } = await res.json()
        setNewRubricForm({ 
          name: "", 
          description: "", 
          orgId: "global", 
          systemPrompt: "", 
          llmModel: "openai/gpt-4o-mini" 
        })
        await fetchData(newRubric?.id)
        setActiveTab("manage")
      }
    } catch (error) {
      console.error("[v0] Error creating rubric:", error)
    }
    setSaving(false)
  }

  async function handleUpdateSystemPrompt() {
    if (!rubric) return

    setSaving(true)
    const res = await fetch(`/api/admin/rubrics/${rubric.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt: systemPrompt, llmModel: llmModel }),
    })
    
    if (res.ok) {
      setRubrics(rubrics.map(r => r.id === rubric.id ? { ...r, system_prompt: systemPrompt, llm_model: llmModel } : r))
      setSystemPromptEdited(false)
      setLlmModelEdited(false)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-16 lg:pb-0 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">
          {t('title')}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t('subtitle')}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md mb-6">
          <TabsTrigger value="manage">
            <Settings2 className="w-4 h-4 mr-2" />
            Manage Rubrics
          </TabsTrigger>
          <TabsTrigger value="create">
            <Plus className="w-4 h-4 mr-2" />
            Create New
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Manage Existing Rubrics */}
        <TabsContent value="manage" className="space-y-6">
          <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-xl border border-border/50">
            <Label className="text-base font-medium min-w-max">Editing Rubric:</Label>
            <Select value={selectedRubricId} onValueChange={setSelectedRubricId}>
              <SelectTrigger className="w-full max-w-md bg-background">
                <SelectValue placeholder="Select a rubric" />
              </SelectTrigger>
              <SelectContent>
                {rubrics.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} {r.is_default && <span className="text-muted-foreground ml-1 text-xs">(Default)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card className="border-border/50 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 px-6 py-4 border-b">
              <CardTitle className="text-xl">{t('systemPromptTitle')}</CardTitle>
              <CardDescription className="mt-1">
                {t('systemPromptDescription')}
              </CardDescription>
            </div>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-2">
                <Label className="font-semibold">{t('llmModelLabel')}</Label>
                <select
                  value={llmModel}
                  onChange={(e) => {
                    setLlmModel(e.target.value)
                    setLlmModelEdited(true)
                  }}
                  className="w-full max-w-md px-3 py-2 border border-input rounded-md bg-background text-foreground shadow-sm focus:ring-1 focus:ring-ring focus:outline-none transition-shadow"
                >
                  <option value="google/gemini-2.5-flash">{t('llmOptionGemini25Flash')}</option>
                  <option value="google/gemini-2.5-pro">{t('llmOptionGemini25Pro')}</option>
                  <option value="google/gemini-2.0-flash">{t('llmOptionGemini20Flash')}</option>
                  <option value="google/gemini-2.0-flash-lite">{t('llmOptionGemini20FlashLite')}</option>
                </select>
                <p className="text-xs text-muted-foreground">{t('llmModelHint')}</p>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">{t('systemPromptLabel')}</Label>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => {
                    setSystemPrompt(e.target.value)
                    setSystemPromptEdited(true)
                  }}
                  placeholder={t('systemPromptPlaceholder')}
                  className="min-h-40 font-mono text-sm resize-y"
                />
                <p className="text-xs text-muted-foreground">{t('systemPromptFieldHint')}</p>
              </div>

              {(systemPromptEdited || llmModelEdited) && (
                <div className="pt-2">
                  <Button onClick={handleUpdateSystemPrompt} disabled={saving} className="w-full sm:w-auto shadow-md hover:shadow-lg transition-all">
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('saving')}
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        {t('saveChanges')}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Create New Rubric */}
        <TabsContent value="create" className="pt-4">
          <Card className="border-blue-200 dark:border-blue-900 shadow-md">
            <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 px-6 py-6 border-b">
              <CardTitle className="text-2xl flex items-center">
                <Plus className="w-6 h-6 mr-2 text-blue-500" />
                Create a New Rubric
              </CardTitle>
              <CardDescription className="text-base mt-2">
                Rubrics act as templates for evaluating and guiding conversations.
              </CardDescription>
            </div>
            <CardContent className="space-y-6 pt-8 pb-8 px-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Rubric Name *</Label>
                  <Input
                    value={newRubricForm.name}
                    onChange={(e) => setNewRubricForm({ ...newRubricForm, name: e.target.value })}
                    placeholder="E.g., Inbound SaaS Sales"
                    className="h-11"
                  />
                </div>
                
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Organization</Label>
                  <Select 
                    value={newRubricForm.orgId} 
                    onValueChange={(val) => setNewRubricForm({ ...newRubricForm, orgId: val })}
                  >
                    <SelectTrigger className="h-11 bg-background">
                      <SelectValue placeholder="Select an organization" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global" className="font-semibold text-blue-600 dark:text-blue-400">
                        Global (No Org)
                      </SelectItem>
                      {orgs.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold">Description</Label>
                <Textarea
                  value={newRubricForm.description}
                  onChange={(e) => setNewRubricForm({ ...newRubricForm, description: e.target.value })}
                  placeholder="Optional description of when to use this rubric..."
                  className="min-h-24 resize-y"
                />
              </div>

              <div className="space-y-3 pt-4 border-t border-border/50">
                <h4 className="font-semibold text-lg flex items-center text-foreground/90">
                  <Settings2 className="w-4 h-4 mr-2" />
                  Initial AI Configuration
                </h4>
                
                <div className="space-y-2">
                  <Label className="font-medium">LLM Model</Label>
                  <select
                    value={newRubricForm.llmModel}
                    onChange={(e) => setNewRubricForm({ ...newRubricForm, llmModel: e.target.value })}
                    className="w-full max-w-md px-3 py-2 border border-input rounded-md bg-background text-foreground shadow-sm focus:ring-1 focus:ring-ring focus:outline-none transition-shadow h-10"
                  >
                    <option value="google/gemini-2.5-flash">{t('llmOptionGemini25Flash')}</option>
                    <option value="google/gemini-2.5-pro">{t('llmOptionGemini25Pro')}</option>
                    <option value="google/gemini-2.0-flash">{t('llmOptionGemini20Flash')}</option>
                    <option value="google/gemini-2.0-flash-lite">{t('llmOptionGemini20FlashLite')}</option>
                  </select>
                </div>

                <div className="space-y-2 mt-4">
                  <Label className="font-medium">System Prompt</Label>
                  <Textarea
                    value={newRubricForm.systemPrompt}
                    onChange={(e) => setNewRubricForm({ ...newRubricForm, systemPrompt: e.target.value })}
                    placeholder="You are a professional call evaluator. Assess the following call carefully."
                    className="min-h-32 font-mono text-sm resize-y"
                  />
                  <p className="text-xs text-muted-foreground">Optional. A default prompt will be used if left blank.</p>
                </div>
              </div>

              <div className="flex gap-3 pt-6 border-t mt-4">
                <Button 
                  size="lg" 
                  className="px-8 shadow-md hover:shadow-lg transition-all" 
                  onClick={handleCreateRubric} 
                  disabled={!newRubricForm.name || saving}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <Zap className="mr-2 h-5 w-5" />
                  )}
                  Create Rubric
                </Button>
                <Button size="lg" variant="outline" onClick={() => {
                  setNewRubricForm({ 
                    name: "", 
                    description: "",
                    orgId: "global",
                    systemPrompt: "",
                    llmModel: "openai/gpt-4o-mini"
                  })
                  setActiveTab("manage")
                }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
