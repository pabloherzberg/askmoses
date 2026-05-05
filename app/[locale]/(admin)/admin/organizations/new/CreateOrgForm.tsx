'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

type PlanCode = 'starter' | 'pro' | 'pro_rag'

interface CreateResponse {
  data: { id: string; name: string; planCode: PlanCode } | null
  error: { message: string; code: number } | null
}

const PLAN_OPTIONS: PlanCode[] = ['starter', 'pro', 'pro_rag']

export function CreateOrgForm() {
  const t = useTranslations('Admin.createOrg')

  const [name, setName] = useState('')
  const [planCode, setPlanCode] = useState<PlanCode>('starter')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ name: string; plan: PlanCode } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim() || submitting) return

    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), planCode }),
      })
      const json = (await res.json()) as CreateResponse

      if (!res.ok || !json.data) {
        setError(json.error?.message ?? t('genericError'))
        return
      }

      setSuccess({ name: json.data.name, plan: json.data.planCode })
      setName('')
      setPlanCode('starter')
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

      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="mt-2 px-4 py-2 rounded-md text-sm font-medium transition-opacity disabled:opacity-50"
        style={{
          background: 'var(--am-accent)',
          color: 'var(--am-text)',
        }}
      >
        {submitting ? t('submitting') : t('submit')}
      </button>

      {success && (
        <div
          role="status"
          className="px-3 py-2 rounded-md text-sm border"
          style={{
            background: 'var(--am-green-bg)',
            borderColor: 'var(--am-green)',
            color: 'var(--am-green)',
          }}
        >
          {t('successDetail', { name: success.name, plan: t(`plan_${success.plan}`) })}
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
