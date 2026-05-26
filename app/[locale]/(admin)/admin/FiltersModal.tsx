'use client'

import { useEffect, useState } from 'react'
import { X, RotateCcw, Filter as FilterIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { OrgScriptStatus, PlanCode } from '@/lib/types'

export type PlanStatusValue = 'all' | 'active' | 'inactive' | 'trial'

export interface FilterValues {
  scriptStatus: OrgScriptStatus | 'all'
  planCode: PlanCode | 'all'
  planStatus: PlanStatusValue
  scriptVersion: string | 'all'
  mrrMin: string  // string pra controlar input vazio facilmente; convertido no apply
  mrrMax: string
  lastActivityFrom: string  // YYYY-MM-DD ou ''
  lastActivityTo: string
}

export const EMPTY_FILTERS: FilterValues = {
  scriptStatus: 'all',
  planCode: 'all',
  planStatus: 'all',
  scriptVersion: 'all',
  mrrMin: '',
  mrrMax: '',
  lastActivityFrom: '',
  lastActivityTo: '',
}

interface Props {
  open: boolean
  current: FilterValues
  // Valores únicos de versão de script presentes nos dados — passa do parent
  // pra evitar recalcular aqui.
  availableScriptVersions: string[]
  onApply: (values: FilterValues) => void
  onClose: () => void
}

const SCRIPT_STATUSES: Array<OrgScriptStatus | 'all'> = [
  'all', 'none', 'pending', 'active', 'deprecated', 'rejected',
]
const PLAN_CODES: Array<PlanCode | 'all'> = ['all', 'starter', 'pro', 'pro_rag']
const PLAN_STATUSES: PlanStatusValue[] = ['all', 'active', 'trial', 'inactive']

// Modal de filtros avançados pra tabela All Organizations. Aceita estado
// inicial via `current`, mantém edições internas (draft) e só comunica de
// volta no Apply — evita re-render da tabela a cada toque.
export function FiltersModal({ open, current, availableScriptVersions, onApply, onClose }: Props) {
  const t = useTranslations('Admin.tableTools')
  const tStatus = useTranslations('Admin.scriptStatus')
  const tPlanStatus = useTranslations('Admin.statusBadge')
  const tCreate = useTranslations('Admin.createOrg')

  const [draft, setDraft] = useState<FilterValues>(current)

  // Re-sincroniza o draft quando o modal abre — caso o parent tenha mudado
  // os filtros via card click (?filter=pending).
  useEffect(() => {
    if (open) setDraft(current)
  }, [open, current])

  // ESC pra fechar
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const set = <K extends keyof FilterValues>(key: K, value: FilterValues[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-xl rounded-2xl border overflow-hidden"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--am-border)' }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-md inline-flex items-center justify-center shrink-0"
              style={{ background: 'var(--am-accent-bg, rgba(110,86,255,0.12))', color: 'var(--am-accent2)' }}
            >
              <FilterIcon size={16} />
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--am-text)' }}>
                {t('filtersTitle')}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--am-muted)' }}>
                {t('filtersSubtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded hover:opacity-80 transition-opacity"
            style={{ color: 'var(--am-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[65vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Script status */}
          <Field label={t('filterScriptStatus')}>
            <Select
              value={draft.scriptStatus}
              onChange={(v) => set('scriptStatus', v as FilterValues['scriptStatus'])}
              options={SCRIPT_STATUSES.map((s) => ({
                value: s,
                label: s === 'all' ? t('anyOption') : tStatus(s),
              }))}
            />
          </Field>

          {/* Script version */}
          <Field label={t('filterScriptVersion')}>
            <Select
              value={draft.scriptVersion}
              onChange={(v) => set('scriptVersion', v)}
              options={[
                { value: 'all', label: t('anyOption') },
                ...availableScriptVersions.map((v) => ({ value: v, label: `v${v}` })),
              ]}
            />
          </Field>

          {/* Plan */}
          <Field label={t('filterPlan')}>
            <Select
              value={draft.planCode}
              onChange={(v) => set('planCode', v as FilterValues['planCode'])}
              options={PLAN_CODES.map((p) => ({
                value: p,
                label: p === 'all' ? t('anyOption') : tCreate(`plan_${p}`),
              }))}
            />
          </Field>

          {/* Plan status */}
          <Field label={t('filterPlanStatus')}>
            <Select
              value={draft.planStatus}
              onChange={(v) => set('planStatus', v as PlanStatusValue)}
              options={PLAN_STATUSES.map((s) => ({
                value: s,
                label: s === 'all' ? t('anyOption') : tPlanStatus(s),
              }))}
            />
          </Field>

          {/* MRR range */}
          <Field label={t('filterMrr')} fullWidth>
            <div className="flex items-center gap-2">
              <Input
                placeholder={t('mrrMin')}
                type="number"
                min={0}
                value={draft.mrrMin}
                onChange={(v) => set('mrrMin', v)}
              />
              <span style={{ color: 'var(--am-muted)' }}>—</span>
              <Input
                placeholder={t('mrrMax')}
                type="number"
                min={0}
                value={draft.mrrMax}
                onChange={(v) => set('mrrMax', v)}
              />
            </div>
          </Field>

          {/* Last activity range */}
          <Field label={t('filterLastActivity')} fullWidth>
            <div className="flex items-center gap-2">
              <Input
                placeholder={t('dateFrom')}
                type="date"
                value={draft.lastActivityFrom}
                onChange={(v) => set('lastActivityFrom', v)}
              />
              <span style={{ color: 'var(--am-muted)' }}>—</span>
              <Input
                placeholder={t('dateTo')}
                type="date"
                value={draft.lastActivityTo}
                onChange={(v) => set('lastActivityTo', v)}
              />
            </div>
          </Field>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-2 px-5 py-3"
          style={{ borderTop: '1px solid var(--am-border)' }}
        >
          <button
            type="button"
            onClick={() => setDraft(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs"
            style={{ color: 'var(--am-muted)' }}
          >
            <RotateCcw size={12} />
            {t('clearFilters')}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-sm"
              style={{ color: 'var(--am-muted)' }}
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(draft)
                onClose()
              }}
              className="px-4 py-1.5 rounded-md text-sm font-medium"
              style={{ background: 'var(--am-accent)', color: 'var(--am-on-accent)' }}
            >
              {t('applyFilters')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  fullWidth,
}: {
  label: string
  children: React.ReactNode
  fullWidth?: boolean
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${fullWidth ? 'md:col-span-2' : ''}`}>
      <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--am-muted)' }}>
        {label}
      </span>
      {children}
    </label>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 rounded-md border outline-none text-sm cursor-pointer"
      style={{
        background: 'var(--am-bg3)',
        borderColor: 'var(--am-border)',
        color: 'var(--am-text)',
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

function Input(props: {
  placeholder?: string
  type?: string
  min?: number
  value: string
  onChange: (v: string) => void
}) {
  return (
    <input
      type={props.type ?? 'text'}
      min={props.min}
      placeholder={props.placeholder}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className="flex-1 px-3 py-2 rounded-md border outline-none text-sm font-mono"
      style={{
        background: 'var(--am-bg3)',
        borderColor: 'var(--am-border)',
        color: 'var(--am-text)',
      }}
    />
  )
}

// Conta filtros ativos (não === valor default). Útil pro badge no botão Filter.
export function countActiveFilters(f: FilterValues): number {
  let n = 0
  if (f.scriptStatus !== 'all') n++
  if (f.planCode !== 'all') n++
  if (f.planStatus !== 'all') n++
  if (f.scriptVersion !== 'all') n++
  if (f.mrrMin !== '' || f.mrrMax !== '') n++
  if (f.lastActivityFrom !== '' || f.lastActivityTo !== '') n++
  return n
}

// Aplica os filtros à lista — exposto pra AdminPanelClient usar em useMemo.
// Mantém a lógica num lugar só pra evitar drift entre validação e aplicação.
export function applyFiltersToClient<
  C extends {
    plan: { code: PlanCode }
    subscriptionStatus: 'active' | 'inactive' | 'trial'
    mrr: number
    currentScript: { status: OrgScriptStatus; version: string } | null
    lastCallAt: string | null
    createdAt: string
  }
>(client: C, f: FilterValues): boolean {
  // Script status
  const scriptStatus = client.currentScript?.status ?? 'none'
  if (f.scriptStatus !== 'all' && scriptStatus !== f.scriptStatus) return false

  // Script version
  if (f.scriptVersion !== 'all') {
    if (!client.currentScript || client.currentScript.version !== f.scriptVersion) return false
  }

  // Plan
  if (f.planCode !== 'all' && client.plan.code !== f.planCode) return false

  // Plan status
  if (f.planStatus !== 'all' && client.subscriptionStatus !== f.planStatus) return false

  // MRR
  if (f.mrrMin !== '') {
    const min = Number(f.mrrMin)
    if (isFinite(min) && client.mrr < min) return false
  }
  if (f.mrrMax !== '') {
    const max = Number(f.mrrMax)
    if (isFinite(max) && client.mrr > max) return false
  }

  // Last activity
  const activity = client.lastCallAt ?? client.createdAt
  if (f.lastActivityFrom !== '') {
    if (new Date(activity).getTime() < new Date(f.lastActivityFrom).getTime()) return false
  }
  if (f.lastActivityTo !== '') {
    // Inclusivo até final do dia
    const end = new Date(f.lastActivityTo)
    end.setHours(23, 59, 59, 999)
    if (new Date(activity).getTime() > end.getTime()) return false
  }

  return true
}
