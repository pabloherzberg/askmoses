'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

const MIN_LENGTH = 8

interface Props {
  // Quando setado, redireciona pra esse path após save bem sucedido.
  // Caso de uso: primeiro login pós-invite (?welcome=1) — após salvar a senha,
  // leva o Owner/Trainer direto pro home da role em vez de ficar na página.
  welcomeRedirect?: string | null
}

export function PasswordForm({ welcomeRedirect }: Props = {}) {
  const t = useTranslations('Password.form')
  const locale = useLocale()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting) return
    setSuccess(false)
    setError(null)

    if (password.length < MIN_LENGTH) {
      setError(t('errorTooShort', { min: MIN_LENGTH }))
      return
    }
    if (password !== confirm) {
      setError(t('errorMismatch'))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirm }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? t('errorGeneric'))
        return
      }
      setSuccess(true)
      setPassword('')
      setConfirm('')
      // Welcome flow: senha salva → leva pro home da role. Pequeno delay pro
      // user ver o "sucesso" antes do redirect.
      if (welcomeRedirect) {
        setTimeout(() => {
          window.location.href = `/${locale}${welcomeRedirect}`
        }, 800)
      }
    } catch {
      setError(t('errorGeneric'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium" style={{ color: 'var(--am-muted)' }}>
          {t('newLabel')}
        </span>
        <input
          type="password"
          required
          minLength={MIN_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('placeholder')}
          disabled={submitting}
          autoComplete="new-password"
          className="px-3 py-2 rounded-md border outline-none text-sm"
          style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border2)', color: 'var(--am-text)' }}
        />
        <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
          {t('hint', { min: MIN_LENGTH })}
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium" style={{ color: 'var(--am-muted)' }}>
          {t('confirmLabel')}
        </span>
        <input
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t('placeholder')}
          disabled={submitting}
          autoComplete="new-password"
          className="px-3 py-2 rounded-md border outline-none text-sm"
          style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border2)', color: 'var(--am-text)' }}
        />
      </label>

      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <button
          type="submit"
          disabled={submitting || !password || !confirm}
          className="px-4 py-2 rounded-md text-sm font-medium transition-opacity disabled:opacity-50"
          style={{ background: 'var(--am-accent)', color: 'var(--am-text)' }}
        >
          {submitting ? t('submitting') : t('submit')}
        </button>
        <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
          {t('magicLinkNote')}
        </span>
      </div>

      {success && (
        <div
          role="status"
          className="px-3 py-2 rounded-md text-sm border"
          style={{ background: 'var(--am-green-bg)', borderColor: 'var(--am-green)', color: 'var(--am-green)' }}
        >
          {t('successDetail')}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="px-3 py-2 rounded-md text-sm border"
          style={{ background: 'var(--am-red-bg)', borderColor: 'var(--am-red)', color: 'var(--am-red)' }}
        >
          {error}
        </div>
      )}
    </form>
  )
}
