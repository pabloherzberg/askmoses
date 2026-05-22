export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ChevronRight, Inbox, Sparkles } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { getTrainerDbId } from '@/lib/auth'
import { dbGetTrainerNotifications } from '@/lib/db/notifications'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { MarkAllReadButton } from './MarkAllReadButton'

/** Primeira linha não-vazia do corpo, truncada — preview do item na lista. */
function snippet(body: string): string {
  const firstLine = body
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
  if (!firstLine) return ''
  return firstLine.length > 130 ? `${firstLine.slice(0, 130)}…` : firstLine
}

function formatWhen(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

/**
 * Histórico de recomendações de coaching do trainer. Toda recomendação que o
 * Owner enviou aparece aqui — clicar abre o detalhe (estilo corpo de email).
 */
export default async function TrainerRecommendationsPage() {
  const [trainerId, locale, t] = await Promise.all([
    getTrainerDbId(),
    getLocale(),
    getTranslations('Trainer.recommendations'),
  ])
  if (!trainerId) return null

  const rows = await dbGetTrainerNotifications(trainerId)
  const hasUnread = rows.some((r) => r.status === 'unread')

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <SectionLabel>{t('label')}</SectionLabel>
          <h1
            className="text-xl font-semibold tracking-tight"
            style={{ color: 'var(--am-text)' }}
          >
            {t('title')}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
            {t('subtitle')}
          </p>
        </div>
        {hasUnread && <MarkAllReadButton label={t('markAllRead')} />}
      </div>

      {rows.length === 0 ? (
        <div
          className="rounded-2xl border py-16 px-6 flex flex-col items-center text-center"
          style={{ borderColor: 'var(--am-border)', background: 'var(--card)' }}
        >
          <Inbox size={32} style={{ color: 'var(--am-muted)', opacity: 0.4 }} />
          <p className="text-sm font-medium mt-3" style={{ color: 'var(--am-text)' }}>
            {t('empty')}
          </p>
          <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--am-muted)' }}>
            {t('emptyHint')}
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ borderColor: 'var(--am-border)', background: 'var(--card)' }}
        >
          {rows.map((n, i) => (
            <Link
              key={n.id}
              href={`/${locale}/me/recommendations/${n.id}`}
              className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-[var(--am-bg3)]"
              style={{ borderTop: i > 0 ? '1px solid var(--am-border)' : 'none' }}
            >
              {/* Indicador de não lida */}
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{
                  background: n.status === 'unread' ? 'var(--am-accent)' : 'transparent',
                }}
              />
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--am-bg4)', color: 'var(--am-accent2)' }}
              >
                <Sparkles size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    className="text-[13px] font-medium truncate"
                    style={{ color: 'var(--am-text)' }}
                  >
                    {t('listItemTitle', { name: n.sent_by_name })}
                  </p>
                  {n.status === 'unread' && (
                    <span
                      className="text-[9px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: 'var(--am-accent)', color: 'var(--am-on-accent)' }}
                    >
                      {t('unread')}
                    </span>
                  )}
                </div>
                <p
                  className="text-[12px] mt-0.5 truncate"
                  style={{ color: 'var(--am-muted)' }}
                >
                  {snippet(n.body)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
                  {formatWhen(n.created_at, locale)}
                </span>
                <ChevronRight size={15} style={{ color: 'var(--am-muted)' }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
