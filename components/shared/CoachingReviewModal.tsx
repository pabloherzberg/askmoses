'use client'

import { useEffect, useState } from 'react'
import { X, Send, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { CoachingRec } from '@/lib/mock-data'

interface Props {
  open: boolean
  rec: CoachingRec | null
  trainerName: string
  onClose: () => void
  onSent: (order: number) => void
}

type Phase = 'review' | 'sending' | 'sent'

/**
 * Modal de revisão de uma recomendação de coaching. O owner abre, revisa o
 * conteúdo e confirma o envio para o sales person.
 *
 * Fase 1 é demo — não há e-mail nem persistência real (ver CLAUDE.md). O
 * "envio" é apenas uma confirmação de UI: simula latência e mostra o estado
 * de sucesso. O parent marca a rec como enviada via `onSent`.
 */
export function CoachingReviewModal({ open, rec, trainerName, onClose, onSent }: Props) {
  const t = useTranslations('Coaching.reviewModal')
  const [phase, setPhase] = useState<Phase>('review')

  // Reset ao fechar pra não vazar estado entre invocações.
  useEffect(() => {
    if (!open) setPhase('review')
  }, [open])

  // ESC fecha — bloqueado durante o envio.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'sending') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, phase, onClose])

  if (!open || !rec) return null

  const firstName = trainerName.split(' ')[0]

  const handleSend = () => {
    if (phase !== 'review') return
    setPhase('sending')
    window.setTimeout(() => {
      setPhase('sent')
      onSent(rec.order)
    }, 700)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && phase !== 'sending') onClose()
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border overflow-hidden"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--am-border)' }}
        >
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--am-text)' }}>
              {t('title')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--am-muted)' }}>
              {t('subtitle', { name: firstName })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === 'sending'}
            aria-label={t('close')}
            className="p-1 rounded hover:opacity-80 transition-opacity disabled:opacity-40"
            style={{ color: 'var(--am-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {phase === 'sent' ? (
          <div className="px-5 py-8 flex flex-col items-center text-center gap-3">
            <span
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'var(--am-green-bg, rgba(34,217,160,0.12))', color: 'var(--am-green)' }}
            >
              <Check size={24} />
            </span>
            <p className="text-sm font-semibold" style={{ color: 'var(--am-text)' }}>
              {t('sentTitle')}
            </p>
            <p className="text-xs" style={{ color: 'var(--am-muted)' }}>
              {t('sentBody', { name: firstName })}
            </p>
          </div>
        ) : (
          <div className="px-5 py-4">
            {/* Recipient */}
            <p className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: 'var(--am-muted)' }}>
              {t('recipient')}
            </p>
            <p className="text-sm font-medium mb-4" style={{ color: 'var(--am-text)' }}>
              {trainerName}
            </p>

            {/* Recommendation preview (read-only) */}
            <p className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: 'var(--am-muted)' }}>
              {t('recommendation')}
            </p>
            <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: 'var(--am-bg3)' }}>
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono font-bold flex-shrink-0 mt-0.5"
                style={{ background: 'var(--am-green)', color: '#fff' }}
              >
                {rec.order}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold leading-snug mb-0.5" style={{ color: 'var(--am-text)' }}>
                  {rec.title}
                </p>
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--am-text)', opacity: 0.8 }}>
                  {rec.text}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: '1px solid var(--am-border)' }}
        >
          {phase === 'sent' ? (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-md text-sm font-medium transition-opacity"
              style={{ background: 'var(--am-accent)', color: 'var(--am-on-accent)' }}
            >
              {t('close')}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={phase === 'sending'}
                className="px-3 py-1.5 rounded-md text-sm transition-opacity disabled:opacity-50"
                style={{ color: 'var(--am-muted)' }}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={phase === 'sending'}
                className="px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-opacity disabled:opacity-60"
                style={{ background: 'var(--am-accent)', color: 'var(--am-on-accent)' }}
              >
                <Send size={14} />
                {phase === 'sending' ? t('sending') : t('send', { name: firstName })}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
