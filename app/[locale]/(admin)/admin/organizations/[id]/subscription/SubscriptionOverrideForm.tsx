'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type SubStatus = 'active' | 'inactive' | 'trial'
type PlanCode = 'starter' | 'pro' | 'pro_rag'
type TrialPreset = '24h' | '7d' | '14d' | '30d' | '60d' | '90d' | 'custom'

interface ScriptOption {
  id: string
  name: string
  description: string | null
}

interface Props {
  orgId: string
  orgName: string
  initialStatus: SubStatus
  initialPlanCode: PlanCode | null
  initialTrialEndsAt: string | null
  initialMrr: number
  initialScriptId: string | null
  initialScriptName: string | null
  availableScripts: ScriptOption[]
}

const PLAN_OPTIONS: PlanCode[] = ['starter', 'pro', 'pro_rag']
const STATUS_OPTIONS: SubStatus[] = ['active', 'inactive', 'trial']
const TRIAL_PRESETS: TrialPreset[] = ['24h', '7d', '14d', '30d', '60d', '90d', 'custom']

// Computa o timestamp ISO baseado no preset (now + duration). Para 'custom',
// o caller usa o datetime-local input direto. Retorna string ISO ou null.
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

// Converte ISO → string compatível com input[type=datetime-local] (YYYY-MM-DDTHH:mm).
function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SubscriptionOverrideForm({
  orgId,
  orgName,
  initialStatus,
  initialPlanCode,
  initialTrialEndsAt,
  initialMrr,
  initialScriptId,
  initialScriptName,
  availableScripts,
}: Props) {
  const t = useTranslations('Admin.subscriptionOverride')
  const router = useRouter()
  const locale = useLocale()

  const [status, setStatus] = useState<SubStatus>(initialStatus)
  const [planCode, setPlanCode] = useState<PlanCode>(initialPlanCode ?? 'starter')
  const [trialPreset, setTrialPreset] = useState<TrialPreset>('30d')
  const [customDate, setCustomDate] = useState<string>(
    initialTrialEndsAt ? isoToLocalInput(initialTrialEndsAt) : '',
  )
  const [name, setName] = useState<string>(orgName)
  const [mrr, setMrr] = useState<string>(String(initialMrr ?? 0))
  const [scriptId, setScriptId] = useState<string>(initialScriptId ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Pendente entre handleSubmit (que computa+valida) e a confirmação do
  // AlertDialog. Evita re-validar customDate na confirmação.
  const [pendingTrialEndsAt, setPendingTrialEndsAt] = useState<string | null>(null)

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

    // Trocar o script é uma operação "brute-force" — bypassa pending/accept e
    // notifica o Owner por email. Por isso pedimos confirmação explícita via
    // AlertDialog antes de chamar o PATCH /script. O fluxo:
    //   1. Validações já rodaram (acima); construímos o trialEndsAt.
    //   2. Se script mudou → abre dialog, sai. Confirm no dialog chama
    //      performSubmit(trialEndsAt) que faz os PATCHes.
    //   3. Se não mudou → chama performSubmit direto.
    const scriptChanged = !!scriptId && scriptId !== (initialScriptId ?? '')
    if (scriptChanged) {
      setPendingTrialEndsAt(trialEndsAt)
      setConfirmOpen(true)
      setSubmitting(false)
      return
    }

    await performSubmit(trialEndsAt)
  }

  const performSubmit = async (trialEndsAt: string | null) => {
    setSubmitting(true)
    setSuccess(false)
    setError(null)
    const trimmedName = name.trim()
    const parsedMrr = Number(mrr)
    const scriptChanged = !!scriptId && scriptId !== (initialScriptId ?? '')

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

      // Subscription OK → troca o script (se mudou) num 2º request. Falha
      // aqui não desfaz o subscription, mas o erro fica visível pro Admin.
      if (scriptChanged) {
        const sres = await fetch(`/api/admin/organizations/${orgId}/script`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptId }),
        })
        const sjson = await sres.json()
        if (!sres.ok) {
          setError(sjson?.error?.message ?? t('genericError'))
          return
        }
      }

      setSuccess(true)
      router.refresh()
    } catch {
      setError(t('genericError'))
    } finally {
      setSubmitting(false)
    }
  }

  const newScriptName = availableScripts.find((s) => s.id === scriptId)?.name ?? scriptId
  const hasCurrentScript = !!initialScriptName
  const currentScriptName = initialScriptName ?? ''

  return (
    // w-full + max-w-xl: mobile ocupa largura toda (limitado pelo px-4 do
    // wrapper da page), desktop trava em 576px — antes ficava em 448px (md)
    // que era estreito demais com 7 campos.
    <>
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-xl">
      <div className="mb-2">
        <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--am-muted)' }}>
          {t('eyebrow')}
        </p>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--am-text)' }}>
          {orgName}
        </h2>
      </div>

      <label className="flex flex-col gap-1.5">
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
          style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border2)', color: 'var(--am-text)' }}
        />
      </label>

      {status === 'trial' && (
        <>
          <label className="flex flex-col gap-1.5">
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
            <label className="flex flex-col gap-1.5">
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

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium" style={{ color: 'var(--am-muted)' }}>
          {t('scriptLabel')}
        </span>
        <select
          value={scriptId}
          onChange={(e) => setScriptId(e.target.value)}
          disabled={submitting || availableScripts.length === 0}
          className="px-3 py-2 rounded-md border outline-none text-sm cursor-pointer"
          style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border2)', color: 'var(--am-text)' }}
        >
          <option value="">{t('scriptPlaceholder')}</option>
          {availableScripts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.id === initialScriptId ? ` ${t('scriptCurrentSuffix')}` : ''}
            </option>
          ))}
        </select>
        <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
          {t('scriptHint')}
        </span>
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 px-4 py-2 rounded-md text-sm font-medium transition-opacity disabled:opacity-50"
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
          href={`/${locale}/admin/organizations/${orgId}/integrations/ghl`}
          className="text-xs underline opacity-60 hover:opacity-100"
          style={{ color: 'var(--am-muted)' }}
        >
          {t('goToGhl')}
        </a>
      </div>
    </form>

    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {hasCurrentScript
              ? t('confirmScriptChangeTitle')
              : t('confirmScriptSetTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasCurrentScript
              ? t('confirmScriptChange', {
                  from: currentScriptName,
                  to: newScriptName,
                })
              : t('confirmScriptSet', { to: newScriptName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>
            {t('confirmScriptChangeCancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting}
            onClick={() => {
              setConfirmOpen(false)
              void performSubmit(pendingTrialEndsAt)
            }}
          >
            {t('confirmScriptChangeConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
