import Script from "next/script"
import { Navbar } from "@/components/landing/navbar"
import { Hero } from "@/components/landing/hero"
import { Problem } from "@/components/landing/problem"
import { HowItWorks } from "@/components/landing/how-it-works"
import { Benefits } from "@/components/landing/benefits"
import { Industries } from "@/components/landing/industries"
import { Pricing } from "@/components/landing/pricing"
import { DemoForm } from "@/components/landing/demo-form"
import { CtaBand } from "@/components/landing/cta-band"
import { Footer } from "@/components/landing/footer"
import { MobileCtaBar } from "@/components/landing/mobile-cta-bar"
import { ForceLightTheme } from "@/components/landing/ForceLightTheme"

export default function LandingPage() {
  // `className="light"` cobre filhos diretos via cascade; ForceLightTheme
  // remove `dark` do <html> em runtime pra cobrir portais Radix (dropdown,
  // sheet) que renderizam fora da tree. Decisão Vitor: LP sempre em light.
  return (
    <div className="light flex min-h-screen flex-col bg-background pb-20 lg:pb-0">
      <ForceLightTheme />
      {/* GHL form embed loader — só carrega na LP (antes ficava no
         LocaleLayout e era requisitado em todas as rotas autenticadas). */}
      <Script
        src="https://business.unleashedconsulting.com/js/form_embed.js"
        strategy="afterInteractive"
      />
      <Navbar />
      <main className="flex-1">
        <Hero />
        <Problem />
        <HowItWorks />
        <Benefits />
        <Industries />
        <Pricing />
        <DemoForm />
        <CtaBand />
      </main>
      <Footer />
      <MobileCtaBar />
    </div>
  )
}
