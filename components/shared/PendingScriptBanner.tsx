'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, X, Check } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

interface PendingScriptInfo {
  orgScriptId: string
  startedAt: string
  sentByName: string | null
  incoming: {
    id: string
    name: string
    description: string | null
    version: string
  }
  previous: {
    id: string
    name: string
    description: string | null
    version: string
  } | null
}

// PendingScriptBanner: aparece no topo do /overview quando a org tem um
// pending script. Faz fetch ao montar; se houver pending, mostra banner
// com CTA "Ver mudanças". Click abre modal com diff de metadados e botões
// accept/reject.
//
// Decisão: client component porque precisa de refetch após accept/reject
// e estado interativo (modal). Pode rodar na página server-side mas o
// banner em si só renderiza após o fetch — evita layout shift exigindo
// que o consumidor reserve espaço (overview ja tem padding-top suficiente).
export function PendingScriptBanner() {
  const t = useTranslations('Owner.pendingScript')
  const locale = useLocale()
  const router = useRouter()
  const [pending, setPending] = useState<PendingScriptInfo | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch('/api/scripts/pending', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setPending(json?.data?.pending ?? null)
    } catch {
      // Silencioso — banner ausente é o fallback aceitável.
    }
  }, [])

  useEffect(() => {
    void fetchPending()
  }, [fetchPending])

  // Auto-dismiss do toast.
  useEffect(() => {
    if (!toast) return
    const handle = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(handle)
  }, [toast])

  const handleAccepted = (version: string) => {
    setModalOpen(false)
    setPending(null)
    setToast(t('accepted', { version }))
  }

  const handleRejected = (restoredVersion: string | null) => {
    setModalOpen(false)
    setPending(null)
    setToast(
      restoredVersion
        ? t('rejectedRestored', { version: restoredVersion })
        : t('rejectedNoRestore'),
    )
  }

  if (!pending) {
    return toast ? <Toast message={toast} /> : null
  }

  const versionLabel = pending.previous
    ? t('bannerVersionDelta', {
        previous: pending.previous.version,
        incoming: pending.incoming.version,
      })
    : t('bannerVersionNew', { incoming: pending.incoming.version })

  return (
    <>
      <div
        className="mb-4 rounded-2xl border px-5 py-4 flex items-center justify-between gap-4 flex-wrap"
        style={{
          background: 'rgba(110,86,255,0.08)',
          borderColor: 'var(--am-accent)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--am-accent)', color: 'var(--am-on-accent)' }}
          >
            <Sparkles size={16} />
          </div>
          <div className="min-w-0">
            <p
              className="text-[13px] font-medium truncate"
              style={{ color: 'var(--am-text)' }}
            >
              {t('bannerTitle')}
            </p>
            <p
              className="text-[11px] font-mono mt-0.5"
              style={{ color: 'var(--am-accent2)' }}
            >
              {versionLabel}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/${locale}/dashboard/insights?tab=suggestion`)}
          className="cursor-pointer px-4 py-1.5 rounded-md text-xs font-medium whitespace-nowrap"
          style={{ background: 'var(--am-accent)', color: 'var(--am-on-accent)' }}
        >
          {t('bannerCta')} →
        </button>
      </div>

      {modalOpen && (
        <PendingScriptModal
          pending={pending}
          locale={locale}
          onClose={() => setModalOpen(false)}
          onAccepted={handleAccepted}
          onRejected={handleRejected}
        />
      )}

      {toast && <Toast message={toast} />}
    </>
  )
}

function Toast({ message }: { message: string }) {
  return (
    <div
      className="fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-lg border shadow-lg flex items-center gap-2"
      style={{
        background: 'var(--am-bg2)',
        borderColor: 'var(--am-green)',
        color: 'var(--am-text)',
      }}
      role="status"
    >
      <Check size={14} style={{ color: 'var(--am-green)' }} />
      <span className="text-xs font-medium">{message}</span>
    </div>
  )
}

function PendingScriptModal({
  pending,
  locale,
  onClose,
  onAccepted,
  onRejected,
}: {
  pending: PendingScriptInfo
  locale: string
  onClose: () => void
  onAccepted: (version: string) => void
  onRejected: (restoredVersion: string | null) => void
}) {
  const t = useTranslations('Owner.pendingScript')
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ESC fecha quando não há ação em curso.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const formattedDate = new Date(pending.startedAt).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const subtitle = pending.sentByName
    ? t('modalSubtitle', { sender: pending.sentByName, date: formattedDate })
    : t('modalSubtitleNoSender', { date: formattedDate })

  const handleAccept = async () => {
    if (busy) return
    setBusy('accept')
    setError(null)
    try {
      const res = await fetch('/api/scripts/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgScriptId: pending.orgScriptId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? t('genericError'))
        setBusy(null)
        return
      }
      onAccepted(pending.incoming.version)
    } catch {
      setError(t('genericError'))
      setBusy(null)
    }
  }

  const handleReject = async () => {
    if (busy) return
    setBusy('reject')
    setError(null)
    try {
      const res = await fetch('/api/scripts/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgScriptId: pending.orgScriptId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? t('genericError'))
        setBusy(null)
        return
      }
      // Quando restored=true, o RPC retorna o id do script restaurado, mas
      // o front precisa da version humana — derivamos do previous do payload
      // original (era ele que foi restaurado).
      const restored = (json?.data?.restoredScriptId ?? null) as string | null
      const restoredVersion =
        restored && pending.previous ? pending.previous.version : null
      onRejected(restoredVersion)
    } catch {
      setError(t('genericError'))
      setBusy(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        className="w-full max-w-xl rounded-2xl border overflow-hidden"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        <div
          className="flex items-start justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--am-border)' }}
        >
          <div>
            <h2
              className="text-base font-semibold"
              style={{ color: 'var(--am-text)' }}
            >
              {t('modalTitle')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--am-muted)' }}>
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!!busy}
            aria-label="Close"
            className="cursor-pointer p-1 rounded hover:opacity-80 transition-opacity"
            style={{ color: 'var(--am-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Diff side-by-side: current vs incoming */}
        <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <DiffColumn
            label={t('currentLabel')}
            script={pending.previous}
            noScriptLabel={t('noCurrent')}
            noDescriptionLabel={t('noDescription')}
            accent={false}
          />
          <DiffColumn
            label={t('incomingLabel')}
            script={pending.incoming}
            noScriptLabel={t('noCurrent')}
            noDescriptionLabel={t('noDescription')}
            accent={true}
          />
        </div>

        {error && (
          <div className="px-5 pb-2">
            <p
              role="alert"
              className="text-xs px-3 py-2 rounded-md border"
              style={{
                background: 'rgba(255,94,94,0.08)',
                borderColor: 'var(--am-red)',
                color: 'var(--am-red)',
              }}
            >
              {error}
            </p>
          </div>
        )}

        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: '1px solid var(--am-border)' }}
        >
          <button
            type="button"
            onClick={handleReject}
            disabled={!!busy}
            className="cursor-pointer px-3 py-1.5 rounded-md text-sm transition-opacity disabled:opacity-50"
            style={{ color: 'var(--am-muted)' }}
          >
            {busy === 'reject' ? t('rejecting') : t('reject')}
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={!!busy}
            className="cursor-pointer px-4 py-1.5 rounded-md text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: 'var(--am-accent)', color: 'var(--am-on-accent)' }}
          >
            {busy === 'accept' ? t('accepting') : t('accept')}
          </button>
        </div>
      </div>
    </div>
  )
}

function DiffColumn({
  label,
  script,
  noScriptLabel,
  noDescriptionLabel,
  accent,
}: {
  label: string
  script: { name: string; description: string | null; version: string } | null
  noScriptLabel: string
  noDescriptionLabel: string
  accent: boolean
}) {
  return (
    <div
      className="rounded-lg border px-4 py-3"
      style={{
        background: accent
          ? 'rgba(110,86,255,0.08)'
          : 'var(--am-bg3)',
        borderColor: accent ? 'var(--am-accent)' : 'var(--am-border)',
      }}
    >
      <p
        className="text-[10px] font-mono uppercase tracking-wide mb-2"
        style={{ color: accent ? 'var(--am-accent2)' : 'var(--am-muted)' }}
      >
        {label}
      </p>
      {script ? (
        <>
          <div className="flex items-center justify-between gap-2 mb-1">
            <p
              className="text-sm font-medium truncate"
              style={{ color: 'var(--am-text)' }}
            >
              {script.name}
            </p>
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap"
              style={{ background: 'var(--am-bg4)', color: 'var(--am-muted)' }}
            >
              v{script.version}
            </span>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
            {script.description ?? noDescriptionLabel}
          </p>
        </>
      ) : (
        <p className="text-sm" style={{ color: 'var(--am-muted)' }}>
          {noScriptLabel}
        </p>
      )}
    </div>
  )
}
