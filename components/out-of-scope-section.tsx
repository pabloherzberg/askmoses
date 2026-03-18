import { XCircle } from "lucide-react"

// Twilio and RAG are now part of Pro tiers, so removed from exclusions
const exclusions = [
  {
    category: "CRM Integration",
    items: ["GoHighLevel (Pepper) sync", "Auto-pull trainer contacts", "Sync results to CRM", "CRM workflow triggers"],
  },
  {
    category: "Real-Time Features",
    items: ["Live call coaching", "Real-time voice analysis", "Instant feedback during calls", "Tone detection"],
  },
  {
    category: "Platform Scale",
    items: ["Multi-tenant architecture", "White-label solution", "Mobile app", "SSO / SAML authentication"],
  },
  {
    category: "Advanced Analytics",
    items: [
      "Predictive close-rate modeling",
      "A/B testing of scripts",
      "Performance correlation dashboards",
      "Team leaderboards",
    ],
  },
]

export function OutOfScopeSection() {
  return (
    <section className="py-20 px-6 border-t border-border bg-card/50">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Exclusions</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">Out of All Tiers</h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            These features are not included in any of the three tiers. They represent future phases after MVP
            validation.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {exclusions.map((group, index) => (
            <div key={index} className="p-6 bg-background border border-border rounded-xl">
              <h3 className="text-lg font-semibold text-foreground mb-4">{group.category}</h3>
              <ul className="space-y-3">
                {group.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <XCircle className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
