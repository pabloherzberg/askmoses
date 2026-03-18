import { Upload, FileText, Brain, Mail, BarChart3, History } from "lucide-react"

const steps = [
  {
    icon: Upload,
    title: "Upload Call",
    description: "Admin uploads audio file or pastes transcript directly",
  },
  {
    icon: FileText,
    title: "Transcription",
    description: "If audio, Whisper AI transcribes automatically",
  },
  {
    icon: Brain,
    title: "AI Analysis",
    description: "LLM evaluates transcript against the sales rubric",
  },
  {
    icon: Mail,
    title: "Coaching Email",
    description: "Personalized feedback sent to the dog trainer",
  },
  {
    icon: BarChart3,
    title: "Aggregate Summary",
    description: "Ariel receives daily/weekly coaching digest",
  },
  {
    icon: History,
    title: "History Log",
    description: "All analyses stored and searchable",
  },
]

export function WorkflowSection() {
  return (
    <section id="workflow" className="py-20 px-6 border-t border-border">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <span className="text-sm font-medium uppercase tracking-wider text-primary">Core Workflow</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">How Ask Moses Works</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {steps.map((step, index) => (
            <div
              key={index}
              className="relative p-6 bg-card border border-border rounded-xl group hover:border-primary/50 transition-colors"
            >
              <div className="absolute top-4 right-4 text-muted-foreground/30 font-mono text-4xl font-bold">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <step.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
              <p className="text-muted-foreground text-sm">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
