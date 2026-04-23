import { getLocale, getTranslations } from 'next-intl/server'
import { NewCallForm } from './NewCallForm'
import { SectionLabel } from '@/components/shared/SectionLabel'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function NewCallPage() {
  const t = await getTranslations('Trainer')
  const tNew = await getTranslations('Trainer.newCall')
  const locale = await getLocale()

  return (
    <div>
      {/* Back */}
      <Link
        href={`/${locale}/me`}
        className="inline-flex items-center gap-1 text-xs mb-5 transition-colors hover:opacity-80"
        style={{ color: 'var(--am-muted)' }}
      >
        <ChevronLeft size={13} />
        {tNew('backToDashboard')}
      </Link>

      {/* Header */}
      <div className="mb-6">
        <SectionLabel>{t('myCallsLabel')}</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {tNew('title')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
          {tNew('subtitle')}
        </p>
      </div>

      <NewCallForm />
    </div>
  )
}
