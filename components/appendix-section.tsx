import {
  FileText,
  Upload,
  Bot,
  Mail,
  History,
  BarChart3,
  Webhook,
  Database,
  Brain,
  Search,
  BookOpen,
  Settings,
  Check,
  X,
} from "lucide-react"

interface Tier {
  name: string
  timeline: string
  status?: string
  includes?: string
  deliverables: Deliverable[]
}

interface Deliverable {
  category: string
  icon: any
  items: DeliverableItem[] | string[]
}

interface DeliverableItem {
  text: string
  status?: DeliveryStatus
  note?: string
}

type DeliveryStatus = "done" | "pending"

export function AppendixSection() {
  const tiers = [
    {
      name: "Starter",
      timeline: "Week 1-2",
      status: "DELIVERED ✓",
      deliverables: [
        {
          category: "Script & Rubric Manager",
          icon: FileText,
          items: [
            { text: "Create/edit scoring rubric with criteria", status: "done" as DeliveryStatus, note: "Persisted in Supabase" },
            { text: "Define pass/fail thresholds per criterion", status: "done" as DeliveryStatus },
            { text: "Single active script at a time", status: "done" as DeliveryStatus },
            { text: "Customize system prompt for AI analysis", status: "done" as DeliveryStatus },
          ],
        },
        {
          category: "Manual Call Upload",
          icon: Upload,
          items: [
            { text: "Upload audio files (.mp3, .wav, .m4a)", status: "done" as DeliveryStatus },
            { text: "Paste transcript text directly", status: "done" as DeliveryStatus },
            { text: "Input trainer name and email manually", status: "done" as DeliveryStatus },
            { text: "Upload progress indicator", status: "done" as DeliveryStatus },
          ],
        },
        {
          category: "AI Call Analysis",
          icon: Bot,
          items: [
            { text: "Whisper transcription (if audio)", status: "done" as DeliveryStatus },
            { text: "GPT-4o analysis against rubric", status: "done" as DeliveryStatus },
            { text: "Fetches criteria + system prompt from Supabase", status: "done" as DeliveryStatus },
            { text: "Score per criterion (pass/fail)", status: "done" as DeliveryStatus },
            { text: "Overall call score", status: "done" as DeliveryStatus },
            { text: "Specific feedback per criterion", status: "done" as DeliveryStatus },
            { text: "Full transcript display for admin review", status: "done" as DeliveryStatus },
          ],
        },
        {
          category: "Post-Call Coaching Email",
          icon: Mail,
          items: [
            { text: "Manual send coaching email via Resend", status: "done" as DeliveryStatus },
            { text: "Personalized coaching feedback", status: "done" as DeliveryStatus },
            { text: "Actionable improvement tips", status: "done" as DeliveryStatus },
            { text: "Score summary included", status: "done" as DeliveryStatus },
            { text: "Auto-save call to database after email send", status: "done" as DeliveryStatus },
          ],
        },
        {
          category: "Simple History Page",
          icon: History,
          items: [
            { text: "List of all processed calls", status: "done" as DeliveryStatus },
            { text: "Search by trainer name or email", status: "done" as DeliveryStatus },
            { text: "View individual call details with full analysis", status: "done" as DeliveryStatus },
            { text: "Display transcript and scores", status: "done" as DeliveryStatus },
          ],
        },
        {
          category: "Aggregate Summary",
          icon: BarChart3,
          items: [
            { text: "Total calls processed dashboard", status: "done" as DeliveryStatus },
            { text: "Average score trend visualization (line chart)", status: "done" as DeliveryStatus },
            { text: "Top improvement areas aggregated (bar chart)", status: "done" as DeliveryStatus },
            { text: "Smart insights & performance summaries", status: "done" as DeliveryStatus },
            { text: "Achievement badges & trainer recognition", status: "done" as DeliveryStatus },
            { text: "Real-time analytics dashboard", status: "done" as DeliveryStatus },
          ],
        },
      ],
    },
    {
      name: "Pro",
      timeline: "Week 3",
      includes: "Everything in Starter, plus:",
      deliverables: [
        {
          category: "Twilio Webhook Integration",
          icon: Webhook,
          items: [
            "Webhook endpoint for call events",
            "Automatic call ingestion when call ends",
            "Twilio signature validation (security)",
            "Recording URL extraction",
            "Contact metadata parsing",
          ],
        },
        {
          category: "Database Enhancements",
          icon: Database,
          items: [
            "Call queue for processing",
            "Retry logic for failed processing",
            "Webhook event logging",
            "Idempotency handling (no duplicates)",
          ],
        },
        {
          category: "Admin Notifications",
          icon: Settings,
          items: [
            "Error alerts for failed processing",
            "Daily summary email (optional)",
            "Processing status dashboard",
          ],
        },
      ],
    },
    {
      name: "Pro + RAG",
      timeline: "Week 4",
      includes: "Everything in Pro, plus:",
      deliverables: [
        {
          category: "RAG Knowledge Base",
          icon: Brain,
          items: [
            "Vector database setup (pgvector)",
            "Document upload interface",
            "Automatic chunking & embedding",
            "Support for PDFs, docs, text files",
          ],
        },
        {
          category: "Contextual AI Analysis",
          icon: Search,
          items: [
            "Semantic search across knowledge base",
            "Context-aware coaching feedback",
            "Reference specific training materials",
            "Quote relevant best practices",
          ],
        },
        {
          category: "Knowledge Management",
          icon: BookOpen,
          items: [
            "View/delete uploaded documents",
            "Re-index documents on demand",
            "Document usage analytics",
            "Version tracking for updates",
          ],
        },
      ],
    },
  ]

  return (
    <section id="appendix" className="py-24 border-t border-border">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-amber-500 font-medium mb-2">Appendix</p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Detailed Deliverables</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Comprehensive breakdown of what is included in each tier. This serves as the scope contract for the
            engagement.
          </p>
        </div>

        <div className="space-y-16">
          {tiers.map((tier, tierIndex) => (
            <div key={tier.name} className="border border-border rounded-lg overflow-hidden">
              {/* Tier Header */}
              <div className="bg-muted/30 px-6 py-4 border-b border-border flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-amber-500 font-mono text-sm">Tier {tierIndex + 1}</span>
                  <h3 className="text-xl font-bold text-foreground">{tier.name}</h3>
                  {tier.status && (
                    <span className="text-green-500 font-mono text-sm font-semibold">{tier.status}</span>
                  )}
                  {tier.includes && (
                    <span className="text-muted-foreground text-sm hidden md:inline">— {tier.includes}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">{tier.timeline}</span>
                </div>
              </div>

              {tier.includes && (
                <div className="px-6 py-2 bg-muted/10 border-b border-border md:hidden">
                  <span className="text-muted-foreground text-sm">{tier.includes}</span>
                </div>
              )}

              {/* Deliverables Grid */}
              <div className="p-6">
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {tier.deliverables.map((deliverable) => (
                    <div key={deliverable.category} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <deliverable.icon className="w-4 h-4 text-amber-500" />
                        <h4 className="font-semibold text-foreground text-sm">{deliverable.category}</h4>
                      </div>
                      <ul className="space-y-1.5">
                        {deliverable.items.map((item, i) => {
                          // Handle both string items (Pro/Pro+RAG tiers) and object items (Starter tier)
                          const isObject = typeof item === "object" && item !== null
                          const text = isObject ? (item as DeliverableItem).text : item
                          const status = isObject ? (item as DeliverableItem).status : undefined
                          const note = isObject ? (item as DeliverableItem).note : undefined

                          return (
                            <li key={i} className="text-sm flex items-start gap-2">
                              {status ? (
                                status === "done" ? (
                                  <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                ) : (
                                  <X className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                )
                              ) : (
                                <span className="text-amber-500/60 mt-1.5">•</span>
                              )}
                              <span className={status === "done" ? "text-muted-foreground" : status === "pending" ? "text-muted-foreground/70" : "text-muted-foreground"}>
                                {text}
                                {note && (
                                  <span className="text-xs text-muted-foreground/50 ml-1">({note})</span>
                                )}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="mt-12 p-4 border border-border rounded-lg bg-muted/10">
          <p className="text-sm text-muted-foreground">
            <span className="text-amber-500 font-semibold">Note:</span> Any features, integrations, or modifications not
            explicitly listed above are considered out of scope and will require a separate agreement. Changes to scope
            during development may affect timeline and pricing.
          </p>
        </div>
      </div>
    </section>
  )
}
