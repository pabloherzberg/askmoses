"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Navigation */}
      <nav className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-blue-500" />
            <span className="font-bold text-white">AI Coaching</span>
          </div>
          <Button asChild variant="outline" className="border-slate-700 hover:bg-slate-800 bg-transparent">
            <Link href="/dashboard">Enter Dashboard</Link>
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl lg:text-6xl font-bold text-white leading-tight">
                Transform Sales Coaching with AI
              </h1>
              <p className="text-xl text-slate-300">
                Instant, personalized feedback on every call. Scale coaching without scaling costs.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700">
                <Link href="/dashboard/upload">
                  Start Analyzing
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-slate-700 bg-transparent">
                <a href="#features">View Features</a>
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-8 border-t border-slate-800">
              <div>
                <div className="text-2xl font-bold text-blue-400">30+</div>
                <p className="text-sm text-slate-400">Features Delivered</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">100%</div>
                <p className="text-sm text-slate-400">MVP Complete</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">0$</div>
                <p className="text-sm text-slate-400">Setup Cost</p>
              </div>
            </div>
          </div>

          <div className="hidden lg:block">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg blur-2xl opacity-20" />
              <div className="relative bg-slate-800 border border-slate-700 rounded-lg p-8 backdrop-blur-sm">
                <div className="space-y-4">
                  <div className="h-32 bg-slate-700/50 rounded-lg flex items-center justify-center">
                    <Phone className="h-16 w-16 text-slate-600" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-slate-700 rounded w-2/3" />
                    <div className="h-3 bg-slate-700 rounded w-1/2" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Business Goals Section */}
      <section className="bg-slate-800/50 border-y border-slate-800 py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">Business Goals</h2>
            <p className="text-lg text-slate-300">How we achieve training excellence at scale</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-slate-700 bg-slate-900 hover:border-blue-500/50 transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Target className="h-5 w-5 text-blue-500" />
                  <CardTitle>Maximize Coaching Efficiency</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-slate-300">
                Provide instant feedback on calls without manual review time. Coaches spend less time analyzing, more time training.
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-900 hover:border-blue-500/50 transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  <CardTitle>Improve Sales Performance</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-slate-300">
                Identify top improvement areas across all trainers. Focus team training on highest-impact gaps.
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-900 hover:border-blue-500/50 transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Zap className="h-5 w-5 text-blue-500" />
                  <CardTitle>Scale Without Complexity</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-slate-300">
                One admin, unlimited calls analyzed. Consistent, AI-powered feedback that scales infinitely.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How MVP Delivers Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">How We Deliver Value</h2>
          <p className="text-lg text-slate-300">Tier 1 MVP Implementation</p>
        </div>

        <div className="space-y-12">
          {/* Goal 1 */}
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            <div>
              <h3 className="text-2xl font-bold text-white mb-4">Goal 1: Maximize Coaching Efficiency</h3>
              <div className="space-y-3 text-slate-300">
                <p>Instant call analysis eliminates manual review work. Admin uploads audio → AI transcribes + analyzes → coach gets personalized feedback.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <Upload className="h-5 w-5 text-blue-500 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-white">1. Easy Upload</h4>
                  <p className="text-sm text-slate-400">MP3/WAV audio or direct transcript</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <Brain className="h-5 w-5 text-blue-500 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-white">2. AI Analysis</h4>
                  <p className="text-sm text-slate-400">GPT-4o with custom rubric evaluation</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <Mail className="h-5 w-5 text-blue-500 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-white">3. Feedback Email</h4>
                  <p className="text-sm text-slate-400">Personalized coaching delivered instantly</p>
                </div>
              </div>
            </div>
          </div>

          {/* Goal 2 */}
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            <div>
              <h3 className="text-2xl font-bold text-white mb-4">Goal 2: Improve Sales Performance</h3>
              <div className="space-y-3 text-slate-300">
                <p>Analytics dashboard shows exactly what your team struggles with. No guessing, just data-driven training decisions.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <BarChart3 className="h-5 w-5 text-blue-500 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-white">Performance Trends</h4>
                  <p className="text-sm text-slate-400">Score evolution over time with line charts</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <Target className="h-5 w-5 text-blue-500 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-white">Top Improvement Areas</h4>
                  <p className="text-sm text-slate-400">See which criteria fail most across team</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <Zap className="h-5 w-5 text-blue-500 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-white">Smart Insights</h4>
                  <p className="text-sm text-slate-400">Actionable recommendations auto-generated</p>
                </div>
              </div>
            </div>
          </div>

          {/* Goal 3 */}
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            <div>
              <h3 className="text-2xl font-bold text-white mb-4">Goal 3: Scale Without Complexity</h3>
              <div className="space-y-3 text-slate-300">
                <p>Configure once, process unlimited calls. No per-call limits, no pricing surprises.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <Settings className="h-5 w-5 text-blue-500 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-white">Custom Rubrics</h4>
                  <p className="text-sm text-slate-400">Configure scoring criteria + AI system prompt once</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <Users className="h-5 w-5 text-blue-500 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-white">Team History</h4>
                  <p className="text-sm text-slate-400">All calls archived + searchable instantly</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <CheckCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-white">Admin Control</h4>
                  <p className="text-sm text-slate-400">Review before sending emails, track everything</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="bg-slate-800/50 border-y border-slate-800 py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">Complete Feature Set</h2>
            <p className="text-lg text-slate-300">30 features across 6 core areas</p>
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
                <Card key={idx} className="border-slate-700 bg-slate-900">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-blue-500" />
                      <CardTitle className="text-lg">{feature.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-slate-300">
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
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg p-12 lg:p-20 text-center space-y-8">
          <div>
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">Ready to Transform Coaching?</h2>
            <p className="text-lg text-blue-100 max-w-2xl mx-auto">
              Upload your first call, configure your rubric, and start getting AI-powered feedback instantly.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button asChild size="lg" className="bg-white text-blue-600 hover:bg-blue-50">
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
      <footer className="border-t border-slate-800 bg-slate-950 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-slate-400">
          <p>Tier 1 MVP - Complete and delivered</p>
        </div>
      </footer>
    </div>
  )
}
