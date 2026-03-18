import { Check, Upload, Phone, Brain, ArrowRight } from "lucide-react"

const tiers = [
  {
    name: "Starter",
    price: "$4,050",
    timeline: "2 weeks",
    description: "Week 1-2: Validate the core AI coaching value with manual workflow",
    highlight: false,
    features: [
      "Script/Rubric Manager",
      "Manual Call Upload (audio or transcript)",
      "AI Call Analysis (Whisper + GPT-4o)",
      "Post-Call Coaching Email",
      "Aggregate Summary",
      "Simple History Page",
    ],
    notIncluded: ["Twilio Integration", "RAG System"],
    icon: Upload,
  },
  {
    name: "Pro",
    price: "$8,100",
    timeline: "3 weeks",
    description: "Week 3: Automated call ingestion for hands-off operation",
    highlight: true,
    features: [
      "Everything in Starter",
      "Twilio/GHL Webhook Integration",
      "Automatic call ingestion",
      "Contact metadata sync",
      "Zero manual upload needed",
    ],
    notIncluded: ["RAG System"],
    icon: Phone,
  },
  {
    name: "Pro + RAG",
    price: "$11,407",
    timeline: "4 weeks",
    description: "Week 4: Context-aware coaching powered by your training materials",
    highlight: false,
    features: [
      "Everything in Pro",
      "RAG System (vector search)",
      "Multi-document knowledge base",
      "Context-aware AI coaching",
      "Training materials integration",
      "Dynamic reference lookup",
    ],
    notIncluded: [],
    icon: Brain,
  },
]

export function PricingSection() {
  return (
    <section id="pricing" className="py-20 px-6 border-t border-border">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <span className="text-sm font-medium uppercase tracking-wider text-primary">Investment</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">Choose Your Starting Point</h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            All tiers include production-ready code you own. ~90% reusable as you scale.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative p-6 rounded-xl border ${
                tier.highlight ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card"
              }`}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                  Recommended
                </div>
              )}

              <div className="mb-4">
                <div
                  className={`h-10 w-10 rounded-lg flex items-center justify-center mb-4 ${
                    tier.highlight ? "bg-primary/20" : "bg-secondary"
                  }`}
                >
                  <tier.icon className={`h-5 w-5 ${tier.highlight ? "text-primary" : "text-secondary-foreground"}`} />
                </div>
                <h3 className="text-xl font-bold text-foreground">{tier.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{tier.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold text-foreground">{tier.price}</span>
                <span className="text-muted-foreground ml-2">/ {tier.timeline}</span>
              </div>

              <div className="space-y-3 mb-6">
                {tier.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-foreground">{feature}</span>
                  </div>
                ))}
              </div>

              {tier.notIncluded.length > 0 && (
                <div className="pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Not included:</p>
                  <div className="space-y-1">
                    {tier.notIncluded.map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">— {item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Upgrade Path */}
        <div className="mt-12 p-6 bg-card border border-border rounded-xl">
          <h3 className="text-lg font-semibold text-foreground mb-4">Upgrade Path</h3>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-sm">
            <div className="px-4 py-2 bg-secondary rounded-lg text-secondary-foreground">Starter</div>
            <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90 md:rotate-0" />
            <div className="px-4 py-2 bg-primary/10 border border-primary/30 rounded-lg text-foreground">
              Pro (+$4,050)
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90 md:rotate-0" />
            <div className="px-4 py-2 bg-secondary rounded-lg text-secondary-foreground">Pro + RAG (+$3,307)</div>
          </div>
          <p className="text-center text-muted-foreground text-sm mt-4">
            Start with Starter to validate fast. Upgrade anytime — your codebase is built to evolve.
          </p>
        </div>

        {/* Ongoing Costs */}
        <div className="mt-8 p-6 bg-card border border-border rounded-xl">
          <h3 className="text-lg font-semibold text-foreground mb-4">Ongoing Costs (Post-MVP)</h3>

          <div className="mb-6">
            <p className="font-medium text-foreground mb-3">Per Call Analysis Cost</p>
            <p className="text-xs text-muted-foreground mb-3">
              Based on average call duration: 12.5 minutes (range: 5-20 min)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium">Stack</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Transcription</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Analysis</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Cost/Call</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="py-2 text-foreground">Premium</td>
                    <td className="py-2 text-muted-foreground">Whisper ($0.075)</td>
                    <td className="py-2 text-muted-foreground">GPT-4o ($0.10)</td>
                    <td className="py-2 text-right text-foreground font-medium">~$0.18</td>
                  </tr>
                  <tr className="border-b border-border/50 bg-primary/5">
                    <td className="py-2 text-foreground">Recommended</td>
                    <td className="py-2 text-muted-foreground">Whisper ($0.075)</td>
                    <td className="py-2 text-muted-foreground">Gemini 1.5 Flash ($0.01)</td>
                    <td className="py-2 text-right text-foreground font-medium">~$0.09</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 text-foreground">Budget</td>
                    <td className="py-2 text-muted-foreground">Deepgram ($0.054)</td>
                    <td className="py-2 text-muted-foreground">Gemini 1.5 Flash ($0.01)</td>
                    <td className="py-2 text-right text-foreground font-medium">~$0.07</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-foreground">Ultra Budget</td>
                    <td className="py-2 text-muted-foreground">Groq Whisper ($0.023)</td>
                    <td className="py-2 text-muted-foreground">Gemini 1.5 Flash ($0.01)</td>
                    <td className="py-2 text-right text-foreground font-medium">~$0.03</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              *Based on 12.5-minute average call. Includes email delivery (~$0.001).
            </p>
          </div>

          {/* RAG Knowledge Base Costs */}
          <div className="mb-6 p-4 bg-secondary/30 rounded-lg border border-border">
            <p className="font-medium text-foreground mb-3">RAG Knowledge Base Costs (Pro + RAG tier)</p>
            <p className="text-xs text-muted-foreground mb-3">Audio files require transcription before indexing</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium">Operation</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Model</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="py-2 text-foreground">Audio transcription (12.5 min)</td>
                    <td className="py-2 text-muted-foreground">Whisper</td>
                    <td className="py-2 text-right text-foreground font-medium">~$0.075</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 text-foreground">Text embedding</td>
                    <td className="py-2 text-muted-foreground">OpenAI ada-002</td>
                    <td className="py-2 text-right text-foreground font-medium">~$0.0001</td>
                  </tr>
                  <tr className="border-b border-border/50 bg-primary/5">
                    <td className="py-2 text-foreground font-medium">Total per audio file indexed</td>
                    <td className="py-2 text-muted-foreground"></td>
                    <td className="py-2 text-right text-foreground font-medium">~$0.08</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-card rounded-lg">
                <p className="text-sm text-muted-foreground">Index 50 calls</p>
                <p className="text-lg font-bold text-foreground">~$4.00</p>
              </div>
              <div className="p-3 bg-card rounded-lg">
                <p className="text-sm text-muted-foreground">Index 100 calls</p>
                <p className="text-lg font-bold text-foreground">~$8.00</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              *One-time cost per document. Text documents (PDFs, docs) only require embedding (~$0.0001 each).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-4 bg-secondary/50 rounded-lg">
              <p className="font-medium text-foreground">Per Call</p>
              <p className="text-2xl font-bold text-foreground mt-1">$0.03 - $0.18</p>
              <p className="text-muted-foreground text-xs mt-1">Depends on stack choice</p>
            </div>
            <div className="p-4 bg-secondary/50 rounded-lg">
              <p className="font-medium text-foreground">Hosting</p>
              <p className="text-2xl font-bold text-foreground mt-1">~$20/mo</p>
              <p className="text-muted-foreground text-xs mt-1">Vercel + Supabase</p>
            </div>
            <div className="p-4 bg-secondary/50 rounded-lg">
              <p className="font-medium text-foreground">100 calls/day</p>
              <p className="text-2xl font-bold text-foreground mt-1">$90 - $540/mo</p>
              <p className="text-muted-foreground text-xs mt-1">Estimated API costs</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
