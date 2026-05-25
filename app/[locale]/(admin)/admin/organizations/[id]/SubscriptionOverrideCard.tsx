'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

type SubStatus = 'active' | 'inactive' | 'trial'
type PlanCode = 'starter' | 'pro' | 'pro_rag'
type TrialPreset = '24h' | '7d' | '14d' | '30d' | '60d' | '90d' | 'custom'

interface Props {
  orgId: string
  orgName: string
  initialStatus: SubStatus
  initialPlanCode: PlanCode | null
  initialTrialEndsAt: string | null
  initialMrr: number
}

const PLAN_OPTIONS: PlanCode[] = ['starter', 'pro', 'pro_rag']
const STATUS_OPTIONS: SubStatus[] = ['active', 'inactive', 'trial']
const TRIAL_PRESETS: TrialPreset[] = ['24h', '7d', '14d', '30d', '60d', '90d', 'custom']

function computeTrialEnd(preset: Exclude<TrialPreset, 'custom'>): string {
  const now = Date.now()
  const map: Record<Exclude<TrialPreset, 'custom'>, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '14d': 14 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '60d': 60 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  }
  return new Date(now + map[preset]).toISOString()
}

function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SubscriptionOverrideCard({
  orgId,
  orgName,
  initialStatus,
  initialPlanCode,
  initialTrialEndsAt,
  initialMrr,
}: Props) {
  const t = useTranslations('Admin.subscriptionOverride')
  const router = useRouter()

  const [status, setStatus] = useState<SubStatus>(initialStatus)
  const [planCode, setPlanCode] = useState<PlanCode>(initialPlanCode ?? 'starter')
  const [trialPreset, setTrialPreset] = useState<TrialPreset>('30d')
  const [customDate, setCustomDate] = useState<string>(
    initialTrialEndsAt ? isoToLocalInput(initialTrialEndsAt) : '',
  )
  const [name, setName] = useState<string>(orgName)
  const [mrr, setMrr] = useState<string>(String(initialMrr ?? 0))
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setSuccess(false)
    setError(null)

    let trialEndsAt: string | null = null
    if (status === 'trial') {
      if (trialPreset === 'custom') {
        if (!customDate) {
          setError(t('errorCustomDateRequired'))
          setSubmitting(false)
          return
        }
        const d = new Date(customDate)
        if (isNaN(d.getTime()) || d.getTime() <= Date.now()) {
          setError(t('errorDateInFuture'))
          setSubmitting(false)
          return
        }
        trialEndsAt = d.toISOString()
      } else {
        trialEndsAt = computeTrialEnd(trialPreset)
      }
    }

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t('errorOrgNameRequired'))
      setSubmitting(false)
      return
    }
    const parsedMrr = Number(mrr)
    if (!isFinite(parsedMrr) || parsedMrr < 0) {
      setError(t('errorMrrInvalid'))
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          planCode,
          trialEndsAt,
          name: trimmedName,
          mrr: parsedMrr,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? t('genericError'))
        return
      }
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
      <div className="mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--am-text)' }}>
          {t('cardTitle')}
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--am-muted)' }}>
          {t('cardSubtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-xs font-medium" style={{ color: 'var(--am-muted)' }}>
            {t('orgNameLabel')}
          </span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            className="px-3 py-2 rounded-md border outline-none text-sm"
            style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border2)', color: 'var(--am-text)' }}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--am-muted)' }}>
            {t('statusLabel')}
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as SubStatus)}
            disabled={submitting}
            className="px-3 py-2 rounded-md border outline-none text-sm cursor-pointer"
            style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border2)', color: 'var(--am-text)' }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {t(`status_${s}`)}
              </option>
            ))}
          </select>
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
            style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border2)', color: 'var(--am-text)' }}
          >
            {PLAN_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {t(`plan_${code}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
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
            style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border2)', color: 'var(--am-text)' }}
          />
        </label>

        {status === 'trial' && (
          <>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-xs font-medium" style={{ color: 'var(--am-muted)' }}>
                {t('trialDurationLabel')}
              </span>
              <select
                value={trialPreset}
                onChange={(e) => setTrialPreset(e.target.value as TrialPreset)}
                disabled={submitting}
                className="px-3 py-2 rounded-md border outline-none text-sm cursor-pointer"
                style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border2)', color: 'var(--am-text)' }}
              >
                {TRIAL_PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {t(`preset_${p}`)}
                  </option>
                ))}
              </select>
            </label>

            {trialPreset === 'custom' && (
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-xs font-medium" style={{ color: 'var(--am-muted)' }}>
                  {t('customDateLabel')}
                </span>
                <input
                  type="datetime-local"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  disabled={submitting}
                  className="px-3 py-2 rounded-md border outline-none text-sm"
                  style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border2)', color: 'var(--am-text)' }}
                />
              </label>
            )}
          </>
        )}

        <div className="sm:col-span-2 flex flex-col gap-2 mt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-md text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: 'var(--am-accent)', color: 'var(--am-on-accent)' }}
          >
            {submitting ? t('submitting') : t('submit')}
          </button>

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
        </div>
      </form>
    </div>
  )
}
