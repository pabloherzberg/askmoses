'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'

interface InitialView {
  locationId: string | null
  accessTokenMasked: string | null
  webhookSecretMasked: string | null
  hasAccessToken: boolean
  hasWebhookSecret: boolean
  enabled: boolean
  configuredAt: string | null
  lastAuthErrorAt: string | null
}

const AUTH_ERROR_VISIBLE_WINDOW_MS = 24 * 60 * 60 * 1000 // 24h

function isAuthErrorRecent(ts: string | null): boolean {
  if (!ts) return false
  const parsed = Date.parse(ts)
  if (Number.isNaN(parsed)) return false
  return Date.now() - parsed < AUTH_ERROR_VISIBLE_WINDOW_MS
}

interface Props {
  orgId: string
  orgName: string
  initial: InitialView
  webhookUrl: string
}

interface SetupHeaders {
  'Content-Type': string
  'X-GHL-Location-Id': string
  'X-AskMoses-Secret': string
}

interface SetupPayload {
  webhookUrl: string
  headers: SetupHeaders
}

export function GhlIntegrationForm({ orgId, orgName, initial, webhookUrl }: Props) {
  const t = useTranslations('Admin.ghlIntegration')
  const router = useRouter()
  const locale = useLocale()

  const [locationId, setLocationId] = useState(initial.locationId ?? '')
  const [accessToken, setAccessToken] = useState('')
  const [enabled, setEnabled] = useState(initial.enabled)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [setup, setSetup] = useState<SetupPayload | null>(null)
  const [acknowledgedSecret, setAcknowledgedSecret] = useState(false)

  const hasExistingToken = initial.hasAccessToken
  const hasExistingSecret = initial.hasWebhookSecret

  const submit = async (body: Record<string, unknown>) => {
    setSubmitting(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/ghl`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? t('errorGeneric'))
        return
      }
      setSuccess(true)
      if (json?.data?.setup) {
        setSetup(json.data.setup as SetupPayload)
        setAcknowledgedSecret(false)
      } else {
        router.refresh()
      }
    } catch {
      setError(t('errorGeneric'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting) return

    if (enabled && !locationId.trim()) {
      setError(t('errorRequiredLocation'))
      return
    }
    if (enabled && !hasExistingToken && !accessToken.trim()) {
      setError(t('errorRequiredToken'))
      return
    }

    const body: Record<string, unknown> = {
      locationId: locationId.trim(),
      enabled,
    }
    if (accessToken.trim()) body.accessToken = accessToken.trim()
    submit(body)
  }

  const handleRotate = () => {
    if (submitting) return
    if (!window.confirm(t('rotateConfirm'))) return
    submit({ regenerateSecret: true })
  }

  const closeSetupModal = () => {
    setSetup(null)
    setAccessToken('')
    router.refresh()
  }

  const showAuthErrorBanner = isAuthErrorRecent(initial.lastAuthErrorAt)

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-xl">
        <div className="mb-2">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--am-muted)' }}>
            {t('eyebrow')}
          </p>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--am-text)' }}>
            {orgName}
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--am-muted)' }}>
            {t('subtitle')}
          </p>
        </div>

        {showAuthErrorBanner && initial.lastAuthErrorAt && (
          <div
            role="alert"
            className="rounded-md border p-4 flex flex-col gap-1.5"
            style={{ background: 'var(--am-red-bg)', borderColor: 'var(--am-red)', color: 'var(--am-red)' }}
          >
            <div className="text-sm font-semibold">{t('authErrorBannerTitle')}</div>
            <div className="text-xs" style={{ color: 'var(--am-text)' }}>
              {t('authErrorBannerBody')}
            </div>
            <div className="text-[11px] font-mono" style={{ color: 'var(--am-muted)' }}>
              {t('authErrorBannerLastSeen')}: {new Date(initial.lastAuthErrorAt).toLocaleString()}
            </div>
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--am-muted)' }}>
            {t('locationIdLabel')}
          </span>
          <input
            type="text"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            disabled={submitting}
            placeholder="l2VVQax2pxKTUZWYYsW0"
            className="px-3 py-2 rounded-md border outline-none text-sm font-mono"
            style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border2)', color: 'var(--am-text)' }}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--am-muted)' }}>
            {t('accessTokenLabel')}
          </span>
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            disabled={submitting}
            placeholder={
              hasExistingToken && initial.accessTokenMasked
                ? `${initial.accessTokenMasked} (${t('accessTokenPlaceholderKeep')})`
                : t('accessTokenPlaceholder')
            }
            autoComplete="off"
            className="px-3 py-2 rounded-md border outline-none text-sm font-mono"
            style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border2)', color: 'var(--am-text)' }}
          />
          {hasExistingToken && (
            <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
              {t('accessTokenHint')}
            </span>
          )}
        </label>

        <label className="flex items-center gap-2 mt-1">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={submitting}
            className="h-4 w-4 cursor-pointer"
          />
          <span className="text-sm" style={{ color: 'var(--am-text)' }}>
            {t('enableLabel')}
          </span>
        </label>

        {hasExistingSecret && (
          <div
            className="px-3 py-2 rounded-md text-xs border flex items-center justify-between"
            style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border2)', color: 'var(--am-muted)' }}
          >
            <span>
              {t('webhookSecretCurrent')}: <span className="font-mono">{initial.webhookSecretMasked}</span>
            </span>
            <button
              type="button"
              onClick={handleRotate}
              disabled={submitting}
              className="text-xs underline cursor-pointer disabled:opacity-50"
              style={{ color: 'var(--am-accent2)' }}
            >
              {t('rotateButton')}
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 px-4 py-2 rounded-md text-sm font-medium transition-opacity disabled:opacity-50 cursor-pointer"
          style={{ background: 'var(--am-accent)', color: 'var(--am-text)' }}
        >
          {submitting ? t('submitting') : t('saveButton')}
        </button>

        {success && !setup && (
          <div
            role="status"
            className="px-3 py-2 rounded-md text-sm border"
            style={{ background: 'var(--am-green-bg)', borderColor: 'var(--am-green)', color: 'var(--am-green)' }}
          >
            {t('successSaved')}
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

        <div className="flex items-center gap-4 mt-2">
          <a
            href={`/${locale}/admin`}
            className="text-xs underline opacity-60 hover:opacity-100"
            style={{ color: 'var(--am-muted)' }}
          >
            {t('back')}
          </a>
          <span style={{ color: 'var(--am-muted)' }} className="text-xs opacity-40">·</span>
          <a
            href={`/${locale}/admin/organizations/${orgId}/subscription`}
            className="text-xs underline opacity-60 hover:opacity-100"
            style={{ color: 'var(--am-muted)' }}
          >
            {t('goToSubscription')}
          </a>
        </div>
      </form>

      {setup && (
        <SetupModal
          setup={setup}
          acknowledged={acknowledgedSecret}
          onAcknowledge={setAcknowledgedSecret}
          onClose={closeSetupModal}
          t={t}
          fallbackUrl={webhookUrl}
        />
      )}
    </>
  )
}

interface SetupModalProps {
  setup: SetupPayload
  acknowledged: boolean
  onAcknowledge: (v: boolean) => void
  onClose: () => void
  t: ReturnType<typeof useTranslations>
  fallbackUrl: string
}

function SetupModal({ setup, acknowledged, onAcknowledge, onClose, t, fallbackUrl }: SetupModalProps) {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // ignore — user pode copiar manualmente
    }
  }

  const rows: Array<{ key: string; label: string; value: string }> = [
    { key: 'url', label: t('setupModalUrlLabel'), value: setup.webhookUrl || fallbackUrl },
    { key: 'location', label: 'X-GHL-Location-Id', value: setup.headers['X-GHL-Location-Id'] },
    { key: 'secret', label: 'X-AskMoses-Secret', value: setup.headers['X-AskMoses-Secret'] },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xl rounded-lg p-6 flex flex-col gap-4 border"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border2)' }}
      >
        <div>
          <h3 className="text-base font-semibold" style={{ color: 'var(--am-text)' }}>
            {t('setupModalTitle')}
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--am-muted)' }}>
            {t('setupModalIntro')}
          </p>
        </div>

        <div
          className="px-3 py-2 rounded-md text-xs border"
          style={{ background: 'var(--am-amber-bg)', borderColor: 'var(--am-amber)', color: 'var(--am-amber)' }}
        >
          {t('setupModalSecretWarning')}
        </div>

        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.key} className="flex flex-col gap-1">
              <span className="text-[11px] font-medium" style={{ color: 'var(--am-muted)' }}>
                {row.label}
              </span>
              <div className="flex items-stretch gap-2">
                <code
                  className="flex-1 px-2 py-1.5 rounded text-xs font-mono break-all"
                  style={{ background: 'var(--am-bg3)', color: 'var(--am-text)' }}
                >
                  {row.value}
                </code>
                <button
                  type="button"
                  onClick={() => copy(row.key, row.value)}
                  className="px-2 text-xs rounded border cursor-pointer"
                  style={{
                    background: copied === row.key ? 'var(--am-green-bg)' : 'var(--am-bg3)',
                    borderColor: copied === row.key ? 'var(--am-green)' : 'var(--am-border2)',
                    color: copied === row.key ? 'var(--am-green)' : 'var(--am-text)',
                  }}
                >
                  {copied === row.key ? t('copied') : t('copy')}
                </button>
              </div>
            </div>
          ))}
        </div>

        <label className="flex items-center gap-2 mt-1">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => onAcknowledge(e.target.checked)}
            className="h-4 w-4 cursor-pointer"
          />
          <span className="text-sm" style={{ color: 'var(--am-text)' }}>
            {t('setupModalCopiedConfirm')}
          </span>
        </label>

        <button
          type="button"
          onClick={onClose}
          disabled={!acknowledged}
          className="mt-2 px-4 py-2 rounded-md text-sm font-medium transition-opacity disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          style={{ background: 'var(--am-accent)', color: 'var(--am-text)' }}
        >
          {t('setupModalClose')}
        </button>
      </div>
    </div>
  )
}
