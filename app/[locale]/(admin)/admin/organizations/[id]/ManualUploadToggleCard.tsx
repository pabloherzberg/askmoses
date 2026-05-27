'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

interface Props {
  orgId: string
  initialEnabled: boolean
}

// Liga/desliga upload manual de calls pra esta org. Default no schema é
// false (GHL/Pepper é o canal padrão); Admin habilita pra clientes que
// ainda precisam do fluxo manual.
export function ManualUploadToggleCard({ orgId, initialEnabled }: Props) {
  const t = useTranslations('Admin.manualUploadToggle')
  const router = useRouter()

  const [enabled, setEnabled] = useState(initialEnabled)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleToggle = async () => {
    if (submitting) return
    const next = !enabled
    setSubmitting(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/manual-upload`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? t('genericError'))
        return
      }
      setEnabled(next)
      setSuccess(true)
      router.refresh()
    } catch {
      setError(t('genericError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="rounded-2xl border p-6 mb-4"
      style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--am-text)' }}>
            {t('cardTitle')}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--am-muted)' }}>
            {t('cardSubtitle')}
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--am-muted)' }}>
            {enabled ? t('statusOn') : t('statusOff')}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t('toggleAriaLabel')}
          onClick={handleToggle}
          disabled={submitting}
          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50"
          style={{ background: enabled ? 'var(--am-accent)' : 'var(--am-bg4)' }}
        >
          <span
            className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
            style={{ transform: enabled ? 'translateX(22px)' : 'translateX(2px)', marginTop: '2px' }}
          />
        </button>
      </div>

      {success && (
        <div
          role="status"
          className="mt-3 px-3 py-2 rounded-md text-sm border"
          style={{ background: 'var(--am-green-bg)', borderColor: 'var(--am-green)', color: 'var(--am-green)' }}
        >
          {t('successDetail')}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 px-3 py-2 rounded-md text-sm border"
          style={{ background: 'var(--am-red-bg)', borderColor: 'var(--am-red)', color: 'var(--am-red)' }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
