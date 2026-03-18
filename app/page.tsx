import { HeroSection } from "@/components/hero-section"
import { ProblemSection } from "@/components/problem-section"
import { WorkflowSection } from "@/components/workflow-section"
import { FeaturesSection } from "@/components/features-section"
import { OutOfScopeSection } from "@/components/out-of-scope-section"
import { MetricsSection } from "@/components/metrics-section"
import { RoadmapSection } from "@/components/roadmap-section"
import { ReusabilitySection } from "@/components/reusability-section"
import { PricingSection } from "@/components/pricing-section"
import { TeamSection } from "@/components/team-section"
import { AppendixSection } from "@/components/appendix-section"
import { Navigation } from "@/components/navigation"

export default function ProposalPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        <HeroSection />
        <ProblemSection />
        <WorkflowSection />
        <FeaturesSection />
        <OutOfScopeSection />
        <MetricsSection />
        <RoadmapSection />
        <ReusabilitySection />
        <PricingSection />
        <TeamSection />
        <AppendixSection />
      </main>
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-6 text-center text-muted-foreground text-sm">
          Ask Moses MVP Proposal — January 2026
        </div>
      </footer>
    </div>
  )
}
