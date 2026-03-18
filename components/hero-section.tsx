import { Sparkles } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export function HeroSection() {
  return (
    <section id="overview" className="pt-32 pb-20 px-6">
      <div className="container mx-auto max-w-4xl">
        <Link
          href="https://netmidas.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 mb-8 w-fit hover:opacity-80 transition-opacity"
        >
          <span className="text-sm text-muted-foreground">Powered by</span>
          <Image src="/images/netlogo.png" alt="Net Results" width={32} height={32} className="h-8 w-auto" />
        </Link>

        <div className="flex items-center gap-2 text-primary mb-6">
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-medium uppercase tracking-wider">Rapid MVP Proposal</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight mb-6 text-balance">
          AI Post-Call Sales Coaching for Dog Trainers
        </h1>
        <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl">
          Automate coaching feedback after every sales call. Turn your best sales methodology into an AI coach that
          scales with your team.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <div className="px-4 py-2 bg-card border border-border rounded-lg">
            <span className="text-muted-foreground text-sm">Timeline</span>
            <p className="text-foreground font-semibold">2 Weeks</p>
          </div>
          <div className="px-4 py-2 bg-card border border-border rounded-lg">
            <span className="text-muted-foreground text-sm">Team</span>
            <p className="text-foreground font-semibold">AI Builder</p>
          </div>
          <div className="px-4 py-2 bg-card border border-border rounded-lg">
            <span className="text-muted-foreground text-sm">Approach</span>
            <p className="text-foreground font-semibold">Manual Upload</p>
          </div>
        </div>
      </div>
    </section>
  )
}
