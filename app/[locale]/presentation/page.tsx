"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { Navigation } from "@/components/navigation"
import {
  CheckCircle,
  TrendingUp,
  Clock,
  Zap,
  BarChart3,
  Mail,
  Upload,
  Settings,
  ArrowRight,
  Phone,
  Brain,
  Target,
  Users,
} from "lucide-react"

export default function PresentationPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Hero Section */}
      <section className="container mx-auto max-w-4xl px-6 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl lg:text-6xl font-bold text-foreground leading-tight">
                Transform Sales Coaching with AI
              </h1>
              <p className="text-xl text-muted-foreground">
                Instant, personalized feedback on every call. Scale coaching without scaling costs.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild size="lg">
                <Link href="/dashboard/upload">
                  Start Analyzing
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#features">View Features</a>
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-8 border-t border-border">
              <div>
                <div className="text-2xl font-bold text-primary">30+</div>
                <p className="text-sm text-muted-foreground">Features Delivered</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">100%</div>
                <p className="text-sm text-muted-foreground">MVP Complete</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">0$</div>
                <p className="text-sm text-muted-foreground">Setup Cost</p>
              </div>
            </div>
          </div>

          <div className="hidden lg:block">
            <div className="relative">
              <div className="absolute inset-0 rounded-lg blur-2xl opacity-20" style={{ background: 'linear-gradient(to right, var(--am-accent), var(--am-accent2))' }} />
              <div className="relative rounded-lg p-8 border" style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}>
                <div className="space-y-4">
                  <div className="h-32 rounded-lg flex items-center justify-center" style={{ background: 'var(--am-bg3)' }}>
                    <Phone className="h-16 w-16" style={{ color: 'var(--am-muted)', opacity: 0.4 }} />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 rounded w-2/3" style={{ background: 'var(--am-bg4)' }} />
                    <div className="h-3 rounded w-1/2" style={{ background: 'var(--am-bg4)' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Business Goals Section */}
      <section className="border-y border-border py-16 lg:py-24" style={{ background: 'var(--am-bg2)' }}>
        <div className="container mx-auto max-w-4xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">Business Goals</h2>
            <p className="text-lg text-muted-foreground">How we achieve training excellence at scale</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border shadow-md" style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Target className="h-5 w-5 text-primary" />
                  <CardTitle>Maximize Coaching Efficiency</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Provide instant feedback on calls without manual review time. Coaches spend less time analyzing, more time training.
              </CardContent>
            </Card>

            <Card className="border shadow-md" style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <CardTitle>Improve Sales Performance</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Identify top improvement areas across the sales team. Focus team training on highest-impact gaps.
              </CardContent>
            </Card>

            <Card className="border shadow-md" style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Zap className="h-5 w-5 text-primary" />
                  <CardTitle>Scale Without Complexity</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                One admin, unlimited calls analyzed. Consistent, AI-powered feedback that scales infinitely.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How MVP Delivers Section */}
      <section className="container mx-auto max-w-4xl px-6 py-16 lg:py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">How We Deliver Value</h2>
          <p className="text-lg text-muted-foreground">Tier 1 MVP Implementation</p>
        </div>

        <div className="space-y-12">
          {/* Goal 1 */}
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            <div>
              <h3 className="text-2xl font-bold text-foreground mb-4">Goal 1: Maximize Coaching Efficiency</h3>
              <div className="space-y-3 text-muted-foreground">
                <p>Instant call analysis eliminates manual review work. Admin uploads audio → AI transcribes + analyzes → coach gets personalized feedback.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <Upload className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-foreground">1. Easy Upload</h4>
                  <p className="text-sm text-muted-foreground">MP3/WAV audio or direct transcript</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <Brain className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-foreground">2. AI Analysis</h4>
                  <p className="text-sm text-muted-foreground">GPT-4o with custom rubric evaluation</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <Mail className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-foreground">3. Feedback Email</h4>
                  <p className="text-sm text-muted-foreground">Personalized coaching delivered instantly</p>
                </div>
              </div>
            </div>
          </div>

          {/* Goal 2 */}
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            <div>
              <h3 className="text-2xl font-bold text-foreground mb-4">Goal 2: Improve Sales Performance</h3>
              <div className="space-y-3 text-muted-foreground">
                <p>Analytics dashboard shows exactly what your team struggles with. No guessing, just data-driven training decisions.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <BarChart3 className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-foreground">Performance Trends</h4>
                  <p className="text-sm text-muted-foreground">Score evolution over time with line charts</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <Target className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-foreground">Top Improvement Areas</h4>
                  <p className="text-sm text-muted-foreground">See which criteria fail most across team</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <Zap className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-foreground">Smart Insights</h4>
                  <p className="text-sm text-muted-foreground">Actionable recommendations auto-generated</p>
                </div>
              </div>
            </div>
          </div>

          {/* Goal 3 */}
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            <div>
              <h3 className="text-2xl font-bold text-foreground mb-4">Goal 3: Scale Without Complexity</h3>
              <div className="space-y-3 text-muted-foreground">
                <p>Configure once, process unlimited calls. No per-call limits, no pricing surprises.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <Settings className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-foreground">Custom Rubrics</h4>
                  <p className="text-sm text-muted-foreground">Configure scoring criteria + AI system prompt once</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <Users className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-foreground">Team History</h4>
                  <p className="text-sm text-muted-foreground">All calls archived + searchable instantly</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-foreground">Admin Control</h4>
                  <p className="text-sm text-muted-foreground">Review before sending emails, track everything</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="border-y border-border py-16 lg:py-24" style={{ background: 'var(--am-bg2)' }}>
        <div className="container mx-auto max-w-4xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">Complete Feature Set</h2>
            <p className="text-lg text-muted-foreground">30 features across 6 core areas</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "Script & Rubric Manager", items: 4, icon: Settings },
              { title: "Manual Call Upload", items: 4, icon: Upload },
              { title: "AI Call Analysis", items: 7, icon: Brain },
              { title: "Post-Call Coaching", items: 5, icon: Mail },
              { title: "Call History", items: 4, icon: Clock },
              { title: "Analytics & Insights", items: 6, icon: BarChart3 },
            ].map((feature, idx) => {
              const Icon = feature.icon
              return (
                <Card key={idx} className="border shadow-md" style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{feature.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>{feature.items} features ✓</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto max-w-4xl px-6 py-20 lg:py-32">
        <div
          className="rounded-lg p-12 lg:p-20 text-center space-y-8"
          style={{ background: 'linear-gradient(to right, var(--am-accent), var(--am-accent2))' }}
        >
          <div>
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">Ready to Transform Coaching?</h2>
            <p className="text-lg text-white/80 max-w-2xl mx-auto">
              Upload your first call, configure your rubric, and start getting AI-powered feedback instantly.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90">
              <Link href="/dashboard/upload">
                Start Now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white text-white hover:bg-white/10 bg-transparent">
              <a href="#features">Learn More</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto max-w-4xl px-6 text-center text-muted-foreground text-sm">
          Tier 1 MVP - Complete and delivered
        </div>
      </footer>
    </div>
  )
}
