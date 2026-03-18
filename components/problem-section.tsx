import { AlertCircle } from "lucide-react"

export function ProblemSection() {
  const problems = [
    "Ariel reviews calls manually — this doesn't scale",
    "Feedback is delayed, inconsistent, or never delivered",
    "No structured way to enforce sales methodology",
    "Trainers miss coaching moments that affect close rates",
  ]

  return (
    <section className="py-20 px-6 border-t border-border">
      <div className="container mx-auto max-w-4xl">
        <div className="flex items-center gap-2 text-primary mb-4">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm font-medium uppercase tracking-wider">The Problem</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">Manual coaching doesn&apos;t scale</h2>
        <div className="space-y-4">
          {problems.map((problem, index) => (
            <div key={index} className="flex items-start gap-4 p-4 bg-card border border-border rounded-lg">
              <span className="text-primary font-mono text-sm">0{index + 1}</span>
              <p className="text-foreground">{problem}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
