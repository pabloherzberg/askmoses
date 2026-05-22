'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

interface NotificationItem {
  id: string
  title: string
  body: string
  sentByName: string
  status: 'unread' | 'read'
  createdAt: string
}

function formatWhen(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/**
 * Sino de notificações de coaching no header. Só aparece para o sales person
 * (a API responde isRecipient:false para owner/admin). Faz poll a cada 30s pra
 * o demo refletir um envio feito em outra sessão.
 */
export function NotificationBell() {
  const t = useTranslations('Shared.notifications')
  const locale = useLocale()
  const [isRecipient, setIsRecipient] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/coaching/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      const data = json?.data
      if (!data) return
      setIsRecipient(Boolean(data.isRecipient))
      setItems(Array.isArray(data.items) ? data.items : [])
      setUnreadCount(typeof data.unreadCount === 'number' ? data.unreadCount : 0)
    } catch {
      // Silencioso — em erro o sino apenas não aparece.
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 30000)
    return () => window.clearInterval(id)
  }, [load])

  const handleToggle = async () => {
    const next = !open
    setOpen(next)
    if (next && unreadCount > 0) {
      // Marca tudo como lido ao abrir — otimista, com PATCH em background.
      setUnreadCount(0)
      setItems((prev) => prev.map((i) => ({ ...i, status: 'read' as const })))
      try {
        await fetch('/api/coaching/notifications', { method: 'PATCH' })
      } catch {
        // Ignora — o próximo poll reconcilia.
      }
    }
  }

  if (!isRecipient) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={t('title')}
        className="relative p-1.5 rounded-md transition-opacity hover:opacity-70"
        style={{ color: 'var(--am-muted)' }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[10px] font-mono font-bold"
            style={{ background: 'var(--am-red)', color: '#fff' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-outside */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-2 w-80 max-h-[420px] overflow-y-auto rounded-xl border shadow-lg z-50"
            style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
          >
            <div
              className="px-4 py-3 sticky top-0"
              style={{ background: 'var(--am-bg2)', borderBottom: '1px solid var(--am-border)' }}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--am-text)' }}>
                {t('title')}
              </p>
            </div>

            {items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell
                  size={24}
                  className="mx-auto mb-2"
                  style={{ color: 'var(--am-muted)', opacity: 0.4 }}
                />
                <p className="text-xs" style={{ color: 'var(--am-muted)' }}>
                  {t('empty')}
                </p>
              </div>
            ) : (
              <div className="flex flex-col">
                {items.map((n) => (
                  <div
                    key={n.id}
                    className="px-4 py-3 flex gap-2.5"
                    style={{ borderBottom: '1px solid var(--am-border)' }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                      style={{
                        background: n.status === 'unread' ? 'var(--am-accent)' : 'transparent',
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[13px] font-semibold leading-snug"
                        style={{ color: 'var(--am-text)' }}
                      >
                        {n.title}
                      </p>
                      <p
                        className="text-[12px] leading-relaxed mt-0.5"
                        style={{ color: 'var(--am-text)', opacity: 0.8 }}
                      >
                        {n.body}
                      </p>
                      <p className="text-[11px] mt-1.5" style={{ color: 'var(--am-muted)' }}>
                        {t('sentBy', { name: n.sentByName })} · {formatWhen(n.createdAt, locale)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
