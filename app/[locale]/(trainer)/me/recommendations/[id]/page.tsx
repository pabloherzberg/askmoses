export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { getTrainerDbId } from '@/lib/auth'
import {
  dbGetTrainerNotificationById,
  dbMarkTrainerNotificationRead,
} from '@/lib/db/notifications'

interface Props {
  params: Promise<{ id: string }>
}

function formatFull(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/**
 * Detalhe de uma recomendação de coaching — layout espelha o corpo do email
 * (lib/email/coaching-rec-template.ts): faixa accent no topo, saudação +
 * intro, bloco da recomendação com borda accent à esquerda. Abrir o detalhe
 * conta como leitura → marca a recomendação como lida.
 */
export default async function RecommendationDetailPage({ params }: Props) {
  const { id } = await params
  const [trainerId, locale, t] = await Promise.all([
    getTrainerDbId(),
    getLocale(),
    getTranslations('Trainer.recommendations'),
  ])
  if (!trainerId) notFound()

  const rec = await dbGetTrainerNotificationById(trainerId, id)
  if (!rec) notFound()

  // Abrir o detalhe = ler a recomendação.
  if (rec.status === 'unread') {
    await dbMarkTrainerNotificationRead(trainerId, id)
  }

  const firstName = rec.recipient_name.split(' ')[0] || rec.recipient_name

  return (
    <div>
      <Link
        href={`/${locale}/me/recommendations`}
        className="inline-flex items-center gap-1.5 text-sm mb-5 transition-opacity hover:opacity-70"
        style={{ color: 'var(--am-muted)' }}
      >
        <ArrowLeft size={15} />
        {t('back')}
      </Link>

      <article
        className="max-w-2xl rounded-2xl border overflow-hidden"
        style={{ borderColor: 'var(--am-border)', background: 'var(--am-bg2)' }}
      >
        {/* Faixa accent — espelha o header roxo do email */}
        <div className="px-7 py-6" style={{ background: 'var(--am-accent)' }}>
          <p
            className="text-[11px] font-mono uppercase tracking-[0.15em]"
            style={{ color: 'var(--am-accent2)' }}
          >
            AskMoses.AI
          </p>
          <h1
            className="text-xl font-semibold mt-1"
            style={{ color: 'var(--am-on-accent)' }}
          >
            💡 {t('headerTitle')}
          </h1>
        </div>

        {/* Corpo */}
        <div className="px-7 py-6">
          <p className="text-[15px] font-semibold" style={{ color: 'var(--am-text)' }}>
            {t('greeting', { name: firstName })}
          </p>
          <p className="text-sm mt-1.5" style={{ color: 'var(--am-muted)' }}>
            {t('intro', { sender: rec.sent_by_name })}
          </p>

          {/* Bloco da recomendação — borda accent à esquerda, quebras preservadas */}
          <div
            className="mt-4 rounded-xl p-5 text-[13.5px] leading-relaxed whitespace-pre-wrap"
            style={{
              background: 'var(--am-bg3)',
              borderLeft: '3px solid var(--am-accent)',
              color: 'var(--am-text)',
            }}
          >
            {rec.body}
          </div>

          {/* Meta — quem enviou + quando */}
          <div
            className="mt-5 pt-4 flex items-center gap-2 text-xs"
            style={{ borderTop: '1px solid var(--am-border)', color: 'var(--am-muted)' }}
          >
            <Sparkles size={13} style={{ color: 'var(--am-accent2)' }} />
            <span>
              {t('sentBy', { name: rec.sent_by_name })} ·{' '}
              {formatFull(rec.created_at, locale)}
            </span>
          </div>
        </div>
      </article>
    </div>
  )
}
