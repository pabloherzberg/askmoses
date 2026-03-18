import { Link2, Rocket, Zap, Building2 } from "lucide-react"

// Renumbered phases to start from Phase 2
const phases = [
  {
    icon: Link2,
    phase: "Phase 2",
    title: "CRM Integration",
    timeline: "Post-MVP",
    items: [
      "GoHighLevel (Pepper) sync",
      "Auto-pull trainer contacts",
      "Sync coaching results to CRM",
      "Workflow triggers",
    ],
  },
  {
    icon: Rocket,
    phase: "Phase 3",
    title: "Enhanced Coaching",
    timeline: "Future",
    items: ["Interactive coach dashboard", "Trainer response tracking", "Script A/B testing", "Detailed analytics"],
  },
  {
    icon: Zap,
    phase: "Phase 4",
    title: "Real-Time Features",
    timeline: "Long-term",
    items: ["Live call guidance", "Voice tone analysis", "Real-time objection handling", "Instant coaching nudges"],
  },
  {
    icon: Building2,
    phase: "Phase 5",
    title: "Platform Scale",
    timeline: "Long-term",
    items: ["Multi-tenant SaaS", "White-label offering", "Enterprise SSO", "Public API"],
  },
]

export function RoadmapSection() {
  return (
    <section id="roadmap" className="py-20 px-6 border-t border-border">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <span className="text-sm font-medium uppercase tracking-wider text-primary">What&apos;s Next</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">Post-MVP Roadmap</h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            After the MVP (Starter → Pro → Pro + RAG), here&apos;s how Ask Moses can continue to evolve.
          </p>
        </div>

        <div className="mb-12 p-6 bg-card border border-border rounded-xl">
          <h3 className="text-lg font-semibold text-foreground mb-4">MVP Build Timeline</h3>
          <div className="flex flex-col md:flex-row items-stretch gap-4">
            <div className="flex-1 p-4 bg-secondary/50 rounded-lg border-l-4 border-primary/30">
              <span className="text-xs text-primary uppercase tracking-wider">Week 1-2</span>
              <p className="font-medium text-foreground mt-1">Starter</p>
              <p className="text-sm text-muted-foreground">Manual Upload + AI Core</p>
            </div>
            <div className="flex-1 p-4 bg-primary/10 rounded-lg border-l-4 border-primary">
              <span className="text-xs text-primary uppercase tracking-wider">Week 3</span>
              <p className="font-medium text-foreground mt-1">Pro</p>
              <p className="text-sm text-muted-foreground">+ Twilio Integration</p>
            </div>
            <div className="flex-1 p-4 bg-secondary/50 rounded-lg border-l-4 border-primary/30">
              <span className="text-xs text-primary uppercase tracking-wider">Week 4</span>
              <p className="font-medium text-foreground mt-1">Pro + RAG</p>
              <p className="text-sm text-muted-foreground">+ Knowledge Base</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {phases.map((phase, index) => (
            <div key={index} className="p-6 bg-card border border-border rounded-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <phase.icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-xs text-muted-foreground px-2 py-1 bg-secondary rounded-full">
                    {phase.timeline}
                  </span>
                </div>
                <span className="text-xs text-primary uppercase tracking-wider">{phase.phase}</span>
                <h3 className="text-lg font-semibold text-foreground mb-4">{phase.title}</h3>
                <ul className="space-y-2">
                  {phase.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="h-1.5 w-1.5 bg-primary/50 rounded-full mt-1.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
