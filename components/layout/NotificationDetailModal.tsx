'use client'

import { useEffect } from 'react'
import { X, Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

export interface NotificationItem {
  id: string
  title: string
  body: string
  sentByName: string
  status: 'unread' | 'read'
  createdAt: string
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

interface Props {
  notification: NotificationItem | null
  onClose: () => void
}

/**
 * Modal de leitura de uma recomendação de coaching. O sino mostra só uma
 * linha curta ("X enviou uma recomendação"); o texto completo — que pode ser
 * longo — abre aqui com um layout legível.
 */
export function NotificationDetailModal({ notification, onClose }: Props) {
  const t = useTranslations('Shared.notifications.detail')
  const locale = useLocale()

  // ESC fecha.
  useEffect(() => {
    if (!notification) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [notification, onClose])

  if (!notification) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border overflow-hidden flex flex-col max-h-[85vh]"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--am-border)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--am-bg3)', color: 'var(--am-accent2)' }}
            >
              <Sparkles size={17} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold" style={{ color: 'var(--am-text)' }}>
                {t('title')}
              </h2>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--am-muted)' }}>
                {t('from', { name: notification.sentByName })} ·{' '}
                {t('received', { when: formatFull(notification.createdAt, locale) })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="p-1 rounded hover:opacity-80 transition-opacity flex-shrink-0"
            style={{ color: 'var(--am-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — texto completo da recomendação, quebras de linha preservadas. */}
        <div className="px-5 py-4 overflow-y-auto">
          <div
            className="rounded-xl p-4 text-[13px] leading-relaxed whitespace-pre-wrap"
            style={{
              background: 'var(--am-bg3)',
              borderLeft: '3px solid var(--am-accent)',
              color: 'var(--am-text)',
            }}
          >
            {notification.body}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end px-5 py-3"
          style={{ borderTop: '1px solid var(--am-border)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--am-accent)', color: 'var(--am-on-accent)' }}
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  )
}
