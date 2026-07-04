'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useToast } from '@/hooks/use-toast'
import { SectionLabel } from '@/components/shared/SectionLabel'
import type { AiModuleConfig, AiModuleConfigLogEntry, AiModuleId } from '@/lib/types'

interface ModuleMeta {
  id: AiModuleId
  icon: string
  tempHint: string
  tempMin: number
  tempMax: number
}

const MODULES: ModuleMeta[] = [
  { id: 'scoring_engine',         icon: '🎯', tempHint: '0.0 – 0.3', tempMin: 0.0, tempMax: 0.3 },
  { id: 'correlation_engine',     icon: '🔗', tempHint: '0.3 – 0.6', tempMin: 0.3, tempMax: 0.6 },
  { id: 'marketing_intelligence', icon: '📣', tempHint: '0.6 – 1.0', tempMin: 0.6, tempMax: 1.0 },
]

interface Props {
  initialConfigs: AiModuleConfig[]
  initialLog: AiModuleConfigLogEntry[]
}

type DraftMap = Record<AiModuleId, { temperature: number; max_tokens: number }>

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function LlmConfigClient({ initialConfigs, initialLog }: Props) {
  const t = useTranslations('Admin.llmConfig')
  const { toast } = useToast()

  const [configs, setConfigs] = useState<AiModuleConfig[]>(initialConfigs)
  const [log, setLog] = useState<AiModuleConfigLogEntry[]>(initialLog)
  const [savingId, setSavingId] = useState<AiModuleId | null>(null)

  const [drafts, setDrafts] = useState<DraftMap>(() =>
    Object.fromEntries(
      initialConfigs.map((c) => [c.module_id, { temperature: c.temperature, max_tokens: c.max_tokens }])
    ) as DraftMap
  )

  const handleSave = async (moduleId: AiModuleId) => {
    const draft = drafts[moduleId]
    if (!draft) return
    setSavingId(moduleId)
    try {
      const res = await fetch('/api/ai-module-configs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_id: moduleId, temperature: draft.temperature, max_tokens: draft.max_tokens, updated_by: 'admin@askmoses.ai' }),
      })
      const json = await res.json() as { data: { config: AiModuleConfig; log: AiModuleConfigLogEntry[] } | null; error: { message: string } | null }
      if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Failed')
      setConfigs((prev) => prev.map((c) => c.module_id === moduleId ? json.data!.config : c))
      setLog(json.data!.log)
      toast({ title: t('toastSavedTitle'), description: t('toastSavedBody', { module: moduleId }) })
    } catch {
      toast({ title: t('toastErrorTitle'), description: t('toastErrorBody'), variant: 'destructive' })
    } finally {
      setSavingId(null)
    }
  }

  const updateDraft = (moduleId: AiModuleId, field: 'temperature' | 'max_tokens', raw: string) => {
    const value = field === 'temperature' ? parseFloat(raw) : parseInt(raw, 10)
    if (isNaN(value)) return
    setDrafts((prev) => ({ ...prev, [moduleId]: { ...prev[moduleId], [field]: value } }))
  }

  const isDirty = (moduleId: AiModuleId) => {
    const original = configs.find((c) => c.module_id === moduleId)
    const draft = drafts[moduleId]
    if (!original || !draft) return false
    return original.temperature !== draft.temperature || original.max_tokens !== draft.max_tokens
  }

  return (
    <div className="space-y-8">
      {/* ── Module cards ─────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        {MODULES.map((meta) => {
          const cfg = configs.find((c) => c.module_id === meta.id)
          const draft = drafts[meta.id]
          if (!cfg || !draft) return null
          const dirty = isDirty(meta.id)
          const saving = savingId === meta.id

          return (
            <div
              key={meta.id}
              className="rounded-2xl border p-5 flex flex-col gap-4"
              style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-widest mb-0.5" style={{ color: 'var(--am-muted)' }}>
                    {meta.icon} {t(`modules.${meta.id}`)}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--am-muted)' }}>
                    {t(`moduleDesc.${meta.id}`)}
                  </p>
                </div>
              </div>

              {/* Temperature */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium" style={{ color: 'var(--am-text)' }}>
                    {t('fields.temperature')}
                  </label>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-md" style={{ background: 'var(--am-bg4)', color: 'var(--am-accent2)' }}>
                    {draft.temperature.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={draft.temperature}
                  onChange={(e) => updateDraft(meta.id, 'temperature', e.target.value)}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: 'var(--am-accent)' }}
                />
                <p className="text-[10px]" style={{ color: 'var(--am-muted)' }}>
                  {t('hints.temperatureRange')} <span className="font-mono" style={{ color: 'var(--am-amber)' }}>{meta.tempHint}</span>
                </p>
              </div>

              {/* Max tokens */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium" style={{ color: 'var(--am-text)' }}>
                    {t('fields.maxTokens')}
                  </label>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-md" style={{ background: 'var(--am-bg4)', color: 'var(--am-accent2)' }}>
                    {draft.max_tokens}
                  </span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={4000}
                  step={100}
                  value={draft.max_tokens}
                  onChange={(e) => updateDraft(meta.id, 'max_tokens', e.target.value)}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: 'var(--am-accent)' }}
                />
                <p className="text-[10px]" style={{ color: 'var(--am-muted)' }}>
                  {t('hints.maxTokensRange')} <span className="font-mono" style={{ color: 'var(--am-blue)' }}>100 – 4000</span>
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-1">
                <p className="text-[10px]" style={{ color: 'var(--am-muted)' }}>
                  {t('updatedBy')} <span className="font-mono">{cfg.updated_by}</span>
                  <br />
                  {formatDate(cfg.updated_at)}
                </p>
                <button
                  onClick={() => handleSave(meta.id)}
                  disabled={!dirty || saving}
                  className="text-xs font-semibold px-4 py-1.5 rounded-lg transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: dirty ? 'var(--am-accent)' : 'var(--am-bg4)', color: dirty ? 'white' : 'var(--am-muted)' }}
                >
                  {saving ? t('saving') : t('save')}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Change log ───────────────────────────────────────────── */}
      <div>
        <SectionLabel>{t('logLabel')}</SectionLabel>
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
                  {(['logModule', 'logField', 'logPrev', 'logNew', 'logUser', 'logDate'] as const).map((k) => (
                    <th
                      key={k}
                      className="text-[11px] font-medium text-left px-4 py-3"
                      style={{ color: 'var(--am-muted)' }}
                    >
                      {t(`th.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--am-muted)' }}>
                      {t('logEmpty')}
                    </td>
                  </tr>
                ) : (
                  log.map((entry, i) => (
                    <tr
                      key={entry.id}
                      style={{ borderBottom: i < log.length - 1 ? '1px solid var(--am-border)' : 'none' }}
                    >
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'var(--am-bg4)', color: 'var(--am-accent2)' }}>
                          {entry.module_id}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--am-text)' }}>
                        {entry.field}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--am-red)' }}>
                        {entry.field === 'temperature' ? entry.previous_value.toFixed(1) : entry.previous_value}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--am-green)' }}>
                        {entry.field === 'temperature' ? entry.new_value.toFixed(1) : entry.new_value}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--am-muted)' }}>
                        {entry.updated_by}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--am-muted)' }}>
                        {formatDate(entry.updated_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
