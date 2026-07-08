'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { CheckCircle } from 'lucide-react'

const PLAN_LABELS: Record<string, string> = {
  solo: 'Solo',
  pro: 'Pro',
}

export default function SuccessPage() {
  const t = useTranslations('Success')
  const params = useSearchParams()
  const plan = params.get('plan') ?? ''
  const sessionId = params.get('session_id') ?? ''
  const planLabel = PLAN_LABELS[plan] ?? t('defaultPlan')

  const signupHref = `/signup?plan=${encodeURIComponent(plan)}&session_id=${encodeURIComponent(sessionId)}`

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="max-w-md">
        <CheckCircle className="mx-auto mb-6 h-16 w-16 text-green-500" />
        <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-4 text-lg text-foreground/70">
          {t.rich('description', {
            plan: planLabel,
            b: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
          })}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href={signupHref}
            className="inline-flex items-center justify-center rounded-lg bg-foreground px-6 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-80"
          >
            {t('createAccount')}
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:border-foreground/40"
          >
            {t('backToSite')}
          </Link>
        </div>
        <p className="mt-6 text-xs text-foreground/40">
          {t('haveAccount')}{' '}
          <Link href="/login" className="underline hover:text-foreground/70">
            {t('login')}
          </Link>
        </p>
      </div>
    </div>
  )
}
