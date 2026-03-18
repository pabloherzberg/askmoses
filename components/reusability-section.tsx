import { Check, FileText, Upload, Brain, Mail, BarChart3, History } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const reusableComponents = [
  {
    component: "Script/Rubric Manager",
    icon: FileText,
    mvp: "Create & edit sales scripts",
    phase15: "Same, no change needed",
    phase2: "Per-team scripts via GHL",
    phase3: "A/B testing scripts",
    reusability: 95,
    reusabilityReason:
      "Core CRUD logic, database schema, and UI components remain unchanged. Only minor additions for team-based filtering.",
  },
  {
    component: "Manual Call Upload",
    icon: Upload,
    mvp: "Audio upload + paste transcript",
    phase15: "Replaced by Twilio webhook",
    phase2: "Auto-pull from GHL",
    phase3: "Multi-source ingestion",
    reusability: 85,
    reusabilityReason:
      "File processing and transcription pipeline reused. Upload UI becomes secondary input method alongside webhooks.",
  },
  {
    component: "AI Call Analysis",
    icon: Brain,
    mvp: "Per-section scoring & citations",
    phase15: "Real-time processing",
    phase2: "Sync results to CRM",
    phase3: "Detailed analytics",
    reusability: 90,
    reusabilityReason:
      "AI prompts, scoring logic, and analysis pipeline are fully reusable. Only adds output destinations (CRM, real-time).",
  },
  {
    component: "Post-Call Coaching Email",
    icon: Mail,
    mvp: "Branded HTML + tips",
    phase15: "Auto-triggered on call end",
    phase2: "GHL workflow triggers",
    phase3: "Trainer response tracking",
    reusability: 100,
    reusabilityReason:
      "Email templates, sending logic, and formatting are 100% reusable. Future phases only change when/how it's triggered.",
  },
  {
    component: "Aggregate Summary",
    icon: BarChart3,
    mvp: "Daily/weekly digest",
    phase15: "Same, no change needed",
    phase2: "Team comparisons",
    phase3: "Advanced analytics dashboard",
    reusability: 90,
    reusabilityReason:
      "Data aggregation queries and summary generation reused. Phase 3 adds new visualizations on top of same data layer.",
  },
  {
    component: "Simple History Page",
    icon: History,
    mvp: "Search & filter calls",
    phase15: "Real-time updates",
    phase2: "CRM-linked records",
    phase3: "Interactive coach dashboard",
    reusability: 95,
    reusabilityReason:
      "Database queries, filtering logic, and table components fully reused. Future phases extend with additional columns and views.",
  },
]

export function ReusabilitySection() {
  const avgReusability = Math.round(
    reusableComponents.reduce((sum, item) => sum + item.reusability, 0) / reusableComponents.length,
  )

  return (
    <TooltipProvider>
      <section id="reusability" className="py-24 border-t border-border">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Built to Evolve</h2>
            <p className="text-muted-foreground text-lg">
              Every component we build in the MVP is designed to scale with your product. This is production-ready code,
              not a throwaway prototype.
            </p>
          </div>

          {/* Main comparison table */}
          <div className="overflow-x-auto mb-16">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-4 font-semibold text-foreground">MVP Component</th>
                  <th className="text-left py-4 px-4 font-semibold text-amber-500">What We Build</th>
                  <th className="text-left py-4 px-4 font-semibold text-muted-foreground">Phase 1.5: Twilio</th>
                  <th className="text-left py-4 px-4 font-semibold text-muted-foreground">Phase 2: GHL</th>
                  <th className="text-left py-4 px-4 font-semibold text-muted-foreground">Phase 3: Enhanced</th>
                  <th className="text-center py-4 px-4 font-semibold text-foreground">Reuse</th>
                </tr>
              </thead>
              <tbody>
                {reusableComponents.map((item, index) => (
                  <tr key={index} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-500/10">
                          <item.icon className="h-4 w-4 text-amber-500" />
                        </div>
                        <span className="font-medium">{item.component}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        <span className="text-sm">{item.mvp}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-muted-foreground text-sm">{item.phase15}</td>
                    <td className="py-4 px-4 text-muted-foreground text-sm">{item.phase2}</td>
                    <td className="py-4 px-4 text-muted-foreground text-sm">{item.phase3}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm font-semibold text-green-500 cursor-help border-b border-dashed border-green-500/50">
                              {item.reusability}%
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-xs">
                            <p className="text-sm">{item.reusabilityReason}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary stats */}
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <div className="text-4xl font-bold text-amber-500 mb-2">{avgReusability}%</div>
              <div className="text-muted-foreground text-sm">Average Code Reusability</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <div className="text-4xl font-bold text-foreground mb-2">Next.js</div>
              <div className="text-muted-foreground text-sm">Industry Standard Stack</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <div className="text-4xl font-bold text-foreground mb-2">0</div>
              <div className="text-muted-foreground text-sm">Vendor Lock-in</div>
            </div>
          </div>

          {/* Code vs No-Code comparison */}
          <div className="mt-16 max-w-4xl mx-auto">
            <h3 className="text-xl font-semibold text-center mb-8">Code vs No-Code Platforms</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="text-lg font-semibold mb-4 text-muted-foreground">No-Code (Bubble, Glide)</div>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">×</span>
                    <span>Platform lock-in</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">×</span>
                    <span>Limited AI customization</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">×</span>
                    <span>Needs specialized "no-code dev"</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">×</span>
                    <span>Rewrite needed to scale</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">×</span>
                    <span>Monthly platform fees forever</span>
                  </li>
                </ul>
              </div>
              <div className="bg-card border border-amber-500/50 rounded-xl p-6">
                <div className="text-lg font-semibold mb-4 text-amber-500">This MVP (Next.js + Vercel)</div>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>You own the code 100%</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Full AI SDK access</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Any React/Next.js dev can maintain</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Scale without rewriting</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Deploy anywhere (Vercel, AWS, etc.)</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </TooltipProvider>
  )
}
