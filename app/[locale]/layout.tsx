import type React from "react"
import type { Metadata } from "next"
import { DM_Sans, DM_Mono } from "next/font/google"
import { notFound } from "next/navigation"
import { hasLocale, NextIntlClientProvider } from "next-intl"
import { getMessages, setRequestLocale } from "next-intl/server"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { MSWProvider } from "@/components/msw-provider"
import { Toaster } from "@/components/ui/toaster"
import { ImpersonationBanner } from "@/components/shared/ImpersonationBanner"
import { routing } from "@/i18n/routing"
import { getActiveOrgContext } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import "@/styles/globals.css"

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
})

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Ask Moses - AI Sales Coaching",
  description:
    "AI-powered post-call sales coaching and team performance intelligence platform. Analyze sales calls, identify improvement areas, and boost team performance with actionable insights.",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

type Props = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }
  setRequestLocale(locale)

  // Pass messages explicitly so every client component under `useTranslations`
  // has the full dictionary available — relying on provider default silently
  // breaks `t()` lookups in client components.
  const messages = await getMessages()

  // Banner de impersonate: server-resolve da org alvo pra renderizar nome.
  // ctx.isImpersonating só é true quando Admin tem JWT app_metadata.impersonating_org_id
  // setado (POST /api/admin/impersonate). Caso normal: null → componente
  // retorna null e não renderiza.
  let impersonatingOrgName: string | null = null
  const ctx = await getActiveOrgContext()
  if (ctx?.isImpersonating && ctx.activeOrgId) {
    const admin = createAdminClient()
    const { data: org } = await admin
      .from('organizations')
      .select('name')
      .eq('id', ctx.activeOrgId)
      .maybeSingle()
    impersonatingOrgName = (org as { name?: string } | null)?.name ?? null
  }

  // CSS var consumida pelo AppHeader (top) e mains (padding-top) — quando
  // impersonando, banner ocupa 36px no topo e tudo escorrega pra baixo.
  // Quando nulo, default 0 mantém o layout original.
  const bannerHeight = impersonatingOrgName ? '36px' : '0px'

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* GHL form embed loader — usado pelo iframe na landing page (/) */}
        <script
          src="https://business.unleashedconsulting.com/js/form_embed.js"
          async
        />
      </head>
      <body
        className={`${dmSans.variable} ${dmMono.variable} font-sans antialiased`}
        style={{ ['--impersonate-banner-h' as string]: bannerHeight }}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
            disableTransitionOnChange
          >
            <ImpersonationBanner orgName={impersonatingOrgName} />
            <MSWProvider>{children}</MSWProvider>
            <Toaster />
            <Analytics />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
