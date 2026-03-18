import { Activity, Heart, Star, TrendingUp } from "lucide-react"

const metrics = [
  {
    icon: Activity,
    category: "Usage",
    title: "Do trainers engage?",
    items: ["Email open rate > 60%", "Trainers reference feedback in calls", "Ariel uses aggregate summaries weekly"],
  },
  {
    icon: Heart,
    category: "Value",
    title: "Is feedback helpful?",
    items: [
      "Qualitative survey: 4+ out of 5",
      "Trainers request more detail (good sign)",
      "Ariel saves 5+ hrs/week on manual review",
    ],
  },
  {
    icon: Star,
    category: "Quality",
    title: "Is AI accurate?",
    items: [
      "Rubric scores align with Ariel's judgment 80%+",
      "No hallucinated quotes",
      "Actionable suggestions (not generic)",
    ],
  },
  {
    icon: TrendingUp,
    category: "Business",
    title: "Does it impact outcomes?",
    items: ["Close rate improvement tracked", "Time-to-close reduction", "Trainer confidence increases"],
  },
]

export function MetricsSection() {
  return (
    <section id="metrics" className="py-20 px-6 border-t border-border">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <span className="text-sm font-medium uppercase tracking-wider text-primary">Success Criteria</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">How We Measure Success</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {metrics.map((metric, index) => (
            <div key={index} className="p-6 bg-card border border-border rounded-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <metric.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <span className="text-xs text-primary uppercase tracking-wider">{metric.category}</span>
                  <h3 className="text-lg font-semibold text-foreground">{metric.title}</h3>
                </div>
              </div>
              <ul className="space-y-2">
                {metric.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <span className="h-1.5 w-1.5 bg-primary rounded-full mt-1.5 shrink-0" />
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
