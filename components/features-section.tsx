import { Settings, Upload, Brain, Mail, PieChart, Clock } from "lucide-react"

const features = [
  {
    icon: Settings,
    title: "Script / Rubric Manager",
    description: "Admin interface for Ariel to create, edit, and version sales scripts and evaluation rubrics.",
    details: ["Multi-script support", "Version history", "Markdown editor", "Rubric sections with weights"],
  },
  {
    icon: Upload,
    title: "Manual Call Upload",
    description: "Simple interface to upload call recordings or paste transcripts for analysis.",
    details: [
      "Audio upload (.mp3, .wav, .m4a)",
      "Direct transcript paste",
      "Whisper AI transcription",
      "Trainer selection",
    ],
  },
  {
    icon: Brain,
    title: "AI Call Analysis",
    description: "LLM-powered evaluation of each call against the active rubric.",
    details: ["Per-section scoring", "Specific quote citations", "Improvement suggestions", "Overall rating"],
  },
  {
    icon: Mail,
    title: "Post-Call Coaching Email",
    description: "Automated email delivery of personalized coaching feedback to the trainer.",
    details: ["Branded HTML template", "Score breakdown", "Actionable tips", "Encouragement tone"],
  },
  {
    icon: PieChart,
    title: "Aggregate Summary",
    description: "Daily or weekly digest for Ariel with team-wide coaching insights.",
    details: ["Average scores", "Top performers", "Common gaps", "Trend indicators"],
  },
  {
    icon: Clock,
    title: "Simple History Page",
    description: "Searchable log of all past call analyses for reference and debugging.",
    details: ["Filter by trainer", "Filter by date", "View full analysis", "Basic search"],
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 px-6 border-t border-border">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <span className="text-sm font-medium uppercase tracking-wider text-primary">MVP Scope</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">What We&apos;re Building</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="p-6 bg-card border border-border rounded-xl hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm mb-4">{feature.description}</p>
                  <ul className="grid grid-cols-2 gap-2">
                    {feature.details.map((detail, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="h-1 w-1 bg-primary rounded-full" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
