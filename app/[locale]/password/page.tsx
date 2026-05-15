export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PasswordForm } from './PasswordForm'
import { WelcomeBanner } from './WelcomeBanner'

interface PageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ welcome?: string; next?: string }>
}

export default async function PasswordPage({ params, searchParams }: PageProps) {
  const { locale } = await params
  const { welcome, next } = await searchParams
  const session = await getSession()
  if (!session) redirect(`/${locale}/login`)

  const t = await getTranslations('Password')
  const isWelcome = welcome === '1'
  // next só é honrado se passou pelo allowlist em post-verify.ts. Aqui usamos
  // como hint do home pós-skip; fallback /dashboard se ausente ou inválido.
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  return (
    <div className="max-w-2xl mx-auto">
      {isWelcome && <WelcomeBanner skipHref={safeNext} />}

      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--am-muted)' }}>
          {t('eyebrow')}
        </p>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {t('title')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
          {t('subtitle')}
        </p>
      </div>

      <div
        className="rounded-2xl border p-6"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        <PasswordForm welcomeRedirect={isWelcome ? safeNext : null} />
      </div>
    </div>
  )
}
