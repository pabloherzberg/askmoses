'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

type PlanCode = 'starter' | 'pro' | 'pro_rag'

interface CreateResponse {
  data: {
    id: string
    name: string
    planCode: PlanCode
    ownerEmail?: string
    emailDelivery?: 'sent' | 'mocked'
  } | null
  error: { message: string; code: number } | null
}

interface CatalogScript {
  id: string
  name: string
  version: string
  rubricName: string | null
}

const PLAN_OPTIONS: PlanCode[] = ['starter', 'pro', 'pro_rag']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function CreateOrgForm() {
  const t = useTranslations('Admin.createOrg')

  const [name, setName] = useState('')
  const [planCode, setPlanCode] = useState<PlanCode>('starter')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [mrr, setMrr] = useState<string>('')
  const [scriptId, setScriptId] = useState<string>('')
  const [catalog, setCatalog] = useState<CatalogScript[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{
    name: string
    plan: PlanCode
    ownerEmail?: string
    emailDelivery?: 'sent' | 'mocked'
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Carrega o catálogo de scripts pro select obrigatório.
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/scripts/catalog')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (json?.data) setCatalog(json.data as CatalogScript[])
        else setCatalog([])
      })
      .catch(() => {
        if (!cancelled) setCatalog([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim() || submitting) return
    if (!ownerName.trim()) {
      setError(t('errorOwnerNameRequired'))
      return
    }
    if (!EMAIL_RE.test(ownerEmail.trim())) {
      setError(t('errorOwnerEmailInvalid'))
      return
    }
    // MRR é opcional; quando preenchido tem que ser número >= 0.
    let parsedMrr: number | undefined
    if (mrr.trim() !== '') {
      const n = Number(mrr)
      if (!isFinite(n) || n < 0) {
        setError(t('errorMrrInvalid'))
        return
      }
      parsedMrr = n
    }
    // Script é obrigatório — toda org nasce com 1 script ativo.
    if (!scriptId) {
      setError(t('errorScriptRequired'))
      return
    }

    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          planCode,
          ownerName: ownerName.trim(),
          ownerEmail: ownerEmail.trim().toLowerCase(),
          scriptId,
          ...(parsedMrr !== undefined ? { mrr: parsedMrr } : {}),
        }),
      })
      const json = (await res.json()) as CreateResponse

      if (!res.ok || !json.data) {
        setError(json.error?.message ?? t('genericError'))
        return
      }

      setSuccess({
        name: json.data.name,
        plan: json.data.planCode,
        ownerEmail: json.data.ownerEmail,
        emailDelivery: json.data.emailDelivery,
      })
      setName('')
      setPlanCode('starter')
      setOwnerName('')
      setOwnerEmail('')
      setMrr('')
      setScriptId('')
    } catch {
      setError(t('genericError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium" style={{ color: 'var(--am-muted)' }}>
          {t('nameLabel')}
        </span>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
          disabled={submitting}
          className="px-3 py-2 rounded-md border outline-none text-sm"
          style={{
            background: 'var(--am-bg3)',
            borderColor: 'var(--am-border2)',
            color: 'var(--am-text)',
          }}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium" style={{ color: 'var(--am-muted)' }}>
          {t('ownerNameLabel')}
        </span>
        <input
          type="text"
          required
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          placeholder={t('ownerNamePlaceholder')}
          disabled={submitting}
          className="px-3 py-2 rounded-md border outline-none text-sm"
          style={{
            background: 'var(--am-bg3)',
            borderColor: 'var(--am-border2)',
            color: 'var(--am-text)',
          }}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium" style={{ color: 'var(--am-muted)' }}>
          {t('ownerEmailLabel')}
        </span>
        <input
          type="email"
          required
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          placeholder={t('ownerEmailPlaceholder')}
          disabled={submitting}
          className="px-3 py-2 rounded-md border outline-none text-sm"
          style={{
            background: 'var(--am-bg3)',
            borderColor: 'var(--am-border2)',
            color: 'var(--am-text)',
          }}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium" style={{ color: 'var(--am-muted)' }}>
          {t('planLabel')}
        </span>
        <select
          value={planCode}
          onChange={(e) => setPlanCode(e.target.value as PlanCode)}
          disabled={submitting}
          className="px-3 py-2 rounded-md border outline-none text-sm cursor-pointer"
          style={{
            background: 'var(--am-bg3)',
            borderColor: 'var(--am-border2)',
            color: 'var(--am-text)',
          }}
        >
          {PLAN_OPTIONS.map((code) => (
            <option key={code} value={code}>
              {t(`plan_${code}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium" style={{ color: 'var(--am-muted)' }}>
          {t('scriptLabel')}
        </span>
        <select
          required
          value={scriptId}
          onChange={(e) => setScriptId(e.target.value)}
          disabled={submitting || catalog === null}
          className="px-3 py-2 rounded-md border outline-none text-sm cursor-pointer"
          style={{
            background: 'var(--am-bg3)',
            borderColor: 'var(--am-border2)',
            color: 'var(--am-text)',
          }}
        >
          <option value="" disabled>
            {catalog === null ? t('scriptLoading') : t('scriptPlaceholder')}
          </option>
          {(catalog ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              v{s.version} · {s.name}
              {s.rubricName ? ` (${s.rubricName})` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium" style={{ color: 'var(--am-muted)' }}>
          {t('mrrLabel')}
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={mrr}
          onChange={(e) => setMrr(e.target.value)}
          placeholder={t('mrrPlaceholder')}
          disabled={submitting}
          className="px-3 py-2 rounded-md border outline-none text-sm font-mono"
          style={{
            background: 'var(--am-bg3)',
            borderColor: 'var(--am-border2)',
            color: 'var(--am-text)',
          }}
        />
      </label>

      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="mt-2 px-4 py-2 rounded-md text-sm font-medium transition-opacity disabled:opacity-50"
        style={{
          background: 'var(--am-accent)',
          color: 'var(--am-on-accent)',
        }}
      >
        {submitting ? t('submitting') : t('submit')}
      </button>

      {success && (
        <div
          role="status"
          className="px-3 py-2 rounded-md text-sm border flex flex-col gap-1"
          style={{
            background: 'var(--am-green-bg)',
            borderColor: 'var(--am-green)',
            color: 'var(--am-green)',
          }}
        >
          <span>{t('successDetail', { name: success.name, plan: t(`plan_${success.plan}`) })}</span>
          {success.ownerEmail && (
            <span className="text-xs opacity-80">
              {success.emailDelivery === 'mocked'
                ? t('successInviteMocked', { email: success.ownerEmail })
                : t('successInviteSent', { email: success.ownerEmail })}
            </span>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="px-3 py-2 rounded-md text-sm border"
          style={{
            background: 'var(--am-red-bg)',
            borderColor: 'var(--am-red)',
            color: 'var(--am-red)',
          }}
        >
          {error}
        </div>
      )}
    </form>
  )
}
