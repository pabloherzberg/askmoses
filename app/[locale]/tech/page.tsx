"use client"

import Link from "next/link"
import { Code2, Database, Zap, GitBranch, Cloud, Brain, Mail, Filter, Check, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function TechPage() {
  const techStack = [
    { name: "Next.js 16", icon: "⚡", desc: "Full-stack React framework with App Router" },
    { name: "TypeScript", icon: "🔷", desc: "Type-safe development" },
    { name: "Tailwind CSS v4", icon: "🎨", desc: "Utility-first styling" },
    { name: "Supabase", icon: "🟢", desc: "PostgreSQL + Auth + Storage" },
    { name: "Vercel Blob", icon: "📦", desc: "Large file uploads up to 50MB" },
    { name: "AI SDK", icon: "🧠", desc: "Vercel AI SDK for LLM integration" },
    { name: "Resend", icon: "📧", desc: "Email delivery service" },
  ]

  const databases = [
    { table: "rubrics", desc: "Coaching configurations & system prompts", fields: ["id", "name", "system_prompt", "llm_model", "is_active"] },
    { table: "scripts", desc: "Sales process templates with sections", fields: ["id", "name", "sections (JSONB)", "criteria (JSONB)", "rubric_id"] },
    { table: "calls", desc: "Recorded analysis results", fields: ["id", "transcript", "criteria", "score", "email_sent", "script_id"] },
    { table: "criteria", desc: "Evaluation framework", fields: ["id", "name", "description", "sort_order", "rubric_id"] },
  ]

  const apis = [
    {
      route: "POST /api/upload-audio",
      desc: "Large file upload handler (Vercel Blob)",
      flow: ["Client requests upload token", "Validates file type/size (max 50MB)", "Returns signed URL for direct upload", "Bypasses 4.5MB serverless limit"],
    },
    {
      route: "POST /api/transcribe",
      desc: "Audio to transcript conversion",
      flow: ["Receives Blob URL", "Fetches audio from Blob storage", "Uses OpenAI Whisper", "Returns cleaned transcript"],
    },
    {
      route: "POST /api/analyze",
      desc: "AI call analysis engine",
      flow: ["Fetches script + criteria", "Gets system prompt", "Calls GPT-4o-mini or Gemini 2.5", "Returns structured feedback"],
    },
    {
      route: "POST /api/generate-criteria",
      desc: "Auto-generates criteria from script",
      flow: ["Analyzes script description", "GPT creates criteria items", "Saves to database"],
    },
    {
      route: "POST /api/send-coaching",
      desc: "Sends branded email feedback",
      flow: ["Takes analysis results", "Generates HTML email", "Sends via Resend"],
    },
  ]

  const phases = [
    {
      phase: "Phase 1.5: Twilio",
      features: [
        "Real-time call recording via Twilio webhooks",
        "Auto-transcription on call end",
        "Immediate email trigger",
        "No manual upload needed",
      ],
      impact: "85% → 95% automation",
    },
    {
      phase: "Phase 2: GHL Integration",
      features: [
        "Per-team scripts via GoHighLevel",
        "Sync results back to CRM",
        "Workflow triggers for follow-ups",
        "Multi-source ingestion (Twilio + GHL + manual)",
      ],
      impact: "Multi-tenant ready",
    },
    {
      phase: "Phase 3: Advanced Analytics",
      features: [
        "Team comparison dashboards",
        "Trainer progress tracking",
        "A/B testing scripts",
        "Predictive coaching insights",
      ],
      impact: "Revenue-driving features",
    },
  ]

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/50">
      <div className="container mx-auto px-6 py-20">
        {/* Hero */}
        <div className="mb-20 text-center">
          <h1 className="text-5xl font-bold tracking-tight mb-4">Ask Moses: Technical Architecture</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            AI-powered sales coaching platform built on modern tech stack. Real-time analysis, instant feedback, continuous improvement.
          </p>
        </div>

        {/* Tech Stack */}
        <section className="mb-20">
          <div className="mb-8">
            <h2 className="text-3xl font-bold flex items-center gap-2 mb-2">
              <Code2 className="w-8 h-8" />
              Tech Stack
            </h2>
            <p className="text-muted-foreground">Modern, scalable, and production-ready</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {techStack.map((tech, i) => (
              <Card key={i} className="hover:border-primary/50 transition-colors">
                <CardContent className="pt-6">
                  <div className="text-3xl mb-3">{tech.icon}</div>
                  <h3 className="font-semibold text-lg mb-1">{tech.name}</h3>
                  <p className="text-sm text-muted-foreground">{tech.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Database Schema */}
        <section className="mb-20">
          <div className="mb-8">
            <h2 className="text-3xl font-bold flex items-center gap-2 mb-2">
              <Database className="w-8 h-8" />
              Database Schema
            </h2>
            <p className="text-muted-foreground">PostgreSQL via Supabase with RLS policies</p>
          </div>
          <div className="grid gap-4">
            {databases.map((db, i) => (
              <Card key={i}>
                <CardHeader>
                  <CardTitle className="text-lg">{db.table}</CardTitle>
                  <CardDescription>{db.desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {db.fields.map((field, j) => (
                      <code key={j} className="px-3 py-1 bg-muted rounded text-sm">
                        {field}
                      </code>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* API Routes */}
        <section className="mb-20">
          <div className="mb-8">
            <h2 className="text-3xl font-bold flex items-center gap-2 mb-2">
              <Zap className="w-8 h-8" />
              API Routes
            </h2>
            <p className="text-muted-foreground">Server Actions & Route Handlers for backend logic</p>
          </div>
          <div className="grid gap-4">
            {apis.map((api, i) => (
              <Card key={i}>
                <CardHeader>
                  <CardTitle className="font-mono text-base">{api.route}</CardTitle>
                  <CardDescription>{api.desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {api.flow.map((step, j) => (
                      <div key={j} className="flex items-start gap-3">
                        <Check className="w-5 h-5 mt-0.5 text-green-500 flex-shrink-0" />
                        <span className="text-sm">{step}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* AI Integration */}
        <section className="mb-20">
          <div className="mb-8">
            <h2 className="text-3xl font-bold flex items-center gap-2 mb-2">
              <Brain className="w-8 h-8" />
              AI Integration (Vercel AI Gateway)
            </h2>
            <p className="text-muted-foreground">Multi-model support via unified provider API</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Available Models</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 bg-muted rounded">
                  <p className="font-mono text-sm font-semibold mb-1">openai/gpt-4o-mini</p>
                  <p className="text-xs text-muted-foreground">Fast, cheap, reliable</p>
                </div>
                <div className="p-3 bg-muted rounded">
                  <p className="font-mono text-sm font-semibold mb-1">google/gemini-2.5-flash</p>
                  <p className="text-xs text-muted-foreground">Balanced speed & quality</p>
                </div>
                <div className="p-3 bg-muted rounded">
                  <p className="font-mono text-sm font-semibold mb-1">google/gemini-2.5-pro</p>
                  <p className="text-xs text-muted-foreground">Most powerful analysis</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">How It Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-3">
                  <div className="font-semibold text-primary min-w-fit">1. Script Context</div>
                  <p className="text-sm text-muted-foreground">AI receives sales process template</p>
                </div>
                <div className="flex gap-3">
                  <div className="font-semibold text-primary min-w-fit">2. Analysis</div>
                  <p className="text-sm text-muted-foreground">Evaluates transcript vs script + criteria</p>
                </div>
                <div className="flex gap-3">
                  <div className="font-semibold text-primary min-w-fit">3. Feedback</div>
                  <p className="text-sm text-muted-foreground">Structured JSON with scores & tips</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Data Flow */}
        <section className="mb-20">
          <div className="mb-8">
            <h2 className="text-3xl font-bold flex items-center gap-2 mb-2">
              <GitBranch className="w-8 h-8" />
              Data Flow
            </h2>
            <p className="text-muted-foreground">How a call gets analyzed end-to-end</p>
          </div>
          <Card className="p-8">
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center font-semibold">1</div>
                <div>
                  <p className="font-semibold">Upload Audio/Transcript</p>
                  <p className="text-sm text-muted-foreground">Trainer submits call via dashboard</p>
                </div>
              </div>
              <div className="h-8 flex justify-center">
                <ArrowRight className="w-6 h-6 text-muted-foreground rotate-90" />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center font-semibold">2</div>
                <div>
                  <p className="font-semibold">Store in Vercel Blob (if audio)</p>
                  <p className="text-sm text-muted-foreground">Client uploads directly to Blob (up to 50MB)</p>
                </div>
              </div>
              <div className="h-8 flex justify-center">
                <ArrowRight className="w-6 h-6 text-muted-foreground rotate-90" />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center font-semibold">3</div>
                <div>
                  <p className="font-semibold">Transcribe via Whisper</p>
                  <p className="text-sm text-muted-foreground">API fetches from Blob, sends to OpenAI Whisper</p>
                </div>
              </div>
              <div className="h-8 flex justify-center">
                <ArrowRight className="w-6 h-6 text-muted-foreground rotate-90" />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center font-semibold">4</div>
                <div>
                  <p className="font-semibold">Fetch Script + Criteria</p>
                  <p className="text-sm text-muted-foreground">Get scoring rubric from Supabase</p>
                </div>
              </div>
              <div className="h-8 flex justify-center">
                <ArrowRight className="w-6 h-6 text-muted-foreground rotate-90" />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center font-semibold">5</div>
                <div>
                  <p className="font-semibold">AI Analysis</p>
                  <p className="text-sm text-muted-foreground">GPT/Gemini evaluates against script</p>
                </div>
              </div>
              <div className="h-8 flex justify-center">
                <ArrowRight className="w-6 h-6 text-muted-foreground rotate-90" />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center font-semibold">6</div>
                <div>
                  <p className="font-semibold">Save Results</p>
                  <p className="text-sm text-muted-foreground">Store in Supabase calls table</p>
                </div>
              </div>
              <div className="h-8 flex justify-center">
                <ArrowRight className="w-6 h-6 text-muted-foreground rotate-90" />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center font-semibold">7</div>
                <div>
                  <p className="font-semibold">Send Email</p>
                  <p className="text-sm text-muted-foreground">Branded HTML feedback via Resend</p>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Evolution Roadmap */}
        <section className="mb-20">
          <div className="mb-8">
            <h2 className="text-3xl font-bold flex items-center gap-2 mb-2">
              <Cloud className="w-8 h-8" />
              Evolution Roadmap
            </h2>
            <p className="text-muted-foreground">From MVP to revenue-driving features</p>
          </div>
          <div className="grid gap-6">
            {phases.map((phase, i) => (
              <Card key={i} className="border-l-4 border-l-primary">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{phase.phase}</CardTitle>
                      <CardDescription className="mt-2 text-primary font-semibold">{phase.impact}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {phase.features.map((feature, j) => (
                      <li key={j} className="flex items-start gap-3">
                        <Check className="w-5 h-5 mt-0.5 text-green-500 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="text-center">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-12 pb-12">
              <h3 className="text-2xl font-bold mb-4">Ready to Deploy?</h3>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                The MVP is production-ready. Start with Phase 1.5 (Twilio) to eliminate manual uploads and automate the entire flow.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg">
                  <Link href="/dashboard">Go to Dashboard</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/presentation">View Presentation</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
