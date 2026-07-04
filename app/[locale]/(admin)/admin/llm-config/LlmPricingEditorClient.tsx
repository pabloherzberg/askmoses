'use client'

import { Fragment, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useToast } from '@/hooks/use-toast'
import { SectionLabel } from '@/components/shared/SectionLabel'
import type { LlmPricingRow } from '@/lib/types'

interface Props {
  initialPricing: LlmPricingRow[]
}

type EditDraft = { input: string; output: string; perMinute: string }

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function LlmPricingEditorClient({ initialPricing }: Props) {
  const t = useTranslations('Admin.llmConfig.pricingSection')
  const { toast } = useToast()

  const [pricing, setPricing] = useState<LlmPricingRow[]>(initialPricing)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft>({ input: '', output: '', perMinute: '' })
  const [saving, setSaving] = useState(false)
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const [history, setHistory] = useState<LlmPricingRow[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const startEdit = (row: LlmPricingRow) => {
    setEditingId(row.id)
    setDraft({
      input: row.input_usd_per_1m?.toString() ?? '',
      output: row.output_usd_per_1m?.toString() ?? '',
      perMinute: row.usd_per_minute?.toString() ?? '',
    })
  }

  // PREVIEW VISUAL — ainda não funcional. Sem fetch, sem persistência real:
  // atualiza só o estado local (não cria versão de fato, não grava no
  // Supabase). /api/analyze continua 100% hardcoded em OpenAI/env.
  const handleSave = async (row: LlmPricingRow) => {
    setSaving(true)
    await new Promise((r) => setTimeout(r, 300))
    setPricing((prev) =>
      prev.map((p) =>
        p.id === row.id
          ? row.unit === 'per_1m_tokens'
            ? { ...p, input_usd_per_1m: Number(draft.input), output_usd_per_1m: Number(draft.output) }
            : { ...p, usd_per_minute: Number(draft.perMinute) }
          : p,
      ),
    )
    setEditingId(null)
    toast({ title: t('toastPreviewTitle'), description: t('toastPreviewBody', { model: row.model }) })
    setSaving(false)
  }

  const toggleHistory = (row: LlmPricingRow) => {
    if (historyFor === row.id) {
      setHistoryFor(null)
      return
    }
    setHistoryFor(row.id)
    setLoadingHistory(true)
    // Sem tabela real ainda — histórico é só a própria linha atual (preview).
    setHistory([row])
    setLoadingHistory(false)
  }

  if (pricing.length === 0) {
    return (
      <div>
        <SectionLabel>{t('label')}</SectionLabel>
        <div
          className="rounded-2xl border p-5 text-sm"
          style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)', color: 'var(--am-muted)' }}
        >
          {t('historyEmpty')}
        </div>
      </div>
    )
  }

  return (
    <div>
      <SectionLabel>{t('label')}</SectionLabel>
      <h2 className="text-base font-semibold mb-0.5" style={{ color: 'var(--am-text)' }}>
        {t('title')}
      </h2>
      <p className="text-sm mb-2" style={{ color: 'var(--am-muted)' }}>
        {t('subtitle')}
      </p>
      <p
        className="text-xs mb-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
        style={{ background: 'var(--am-bg4)', color: 'var(--am-amber)' }}
      >
        {t('previewBadge')}
      </p>

      <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
                {(['provider', 'model', 'unit', 'input', 'output', 'perMinute', 'effectiveFrom', 'actions'] as const).map((k) => (
                  <th key={k} className="text-[11px] font-medium text-left px-4 py-3" style={{ color: 'var(--am-muted)' }}>
                    {t(`th.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pricing.map((row) => {
                const isEditing = editingId === row.id
                return (
                  <Fragment key={row.id}>
                    <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--am-accent2)' }}>
                        {row.provider}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--am-text)' }}>
                        {row.model}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--am-muted)' }}>
                        {row.unit === 'per_1m_tokens' ? t('unitTokens') : t('unitMinute')}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--am-text)' }}>
                        {isEditing && row.unit === 'per_1m_tokens' ? (
                          <input
                            type="number"
                            step="0.01"
                            value={draft.input}
                            onChange={(e) => setDraft((d) => ({ ...d, input: e.target.value }))}
                            className="w-20 rounded px-2 py-1 text-xs"
                            style={{ background: 'var(--am-bg)', border: '1px solid var(--am-border)', color: 'var(--am-text)' }}
                          />
                        ) : (
                          row.input_usd_per_1m ?? '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--am-text)' }}>
                        {isEditing && row.unit === 'per_1m_tokens' ? (
                          <input
                            type="number"
                            step="0.01"
                            value={draft.output}
                            onChange={(e) => setDraft((d) => ({ ...d, output: e.target.value }))}
                            className="w-20 rounded px-2 py-1 text-xs"
                            style={{ background: 'var(--am-bg)', border: '1px solid var(--am-border)', color: 'var(--am-text)' }}
                          />
                        ) : (
                          row.output_usd_per_1m ?? '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--am-text)' }}>
                        {isEditing && row.unit === 'per_minute' ? (
                          <input
                            type="number"
                            step="0.001"
                            value={draft.perMinute}
                            onChange={(e) => setDraft((d) => ({ ...d, perMinute: e.target.value }))}
                            className="w-20 rounded px-2 py-1 text-xs"
                            style={{ background: 'var(--am-bg)', border: '1px solid var(--am-border)', color: 'var(--am-text)' }}
                          />
                        ) : (
                          row.usd_per_minute ?? '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--am-muted)' }}>
                        {formatDate(row.effective_from)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <button
                              onClick={() => handleSave(row)}
                              disabled={saving}
                              className="font-semibold px-3 py-1 rounded-lg disabled:opacity-40"
                              style={{ background: 'var(--am-accent)', color: 'white' }}
                            >
                              {saving ? t('newVersion') + '...' : t('newVersion')}
                            </button>
                          ) : (
                            <button
                              onClick={() => startEdit(row)}
                              className="font-medium px-3 py-1 rounded-lg hover:opacity-80"
                              style={{ background: 'var(--am-bg4)', color: 'var(--am-text)' }}
                            >
                              {t('edit')}
                            </button>
                          )}
                          <button
                            onClick={() => toggleHistory(row)}
                            className="font-medium px-2 py-1 rounded-lg hover:opacity-80"
                            style={{ color: 'var(--am-muted)' }}
                          >
                            {t('history')}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {historyFor === row.id && (
                      <tr key={`${row.id}-history`}>
                        <td colSpan={8} className="px-4 py-3" style={{ background: 'var(--am-bg3)' }}>
                          {loadingHistory ? (
                            <span className="text-xs" style={{ color: 'var(--am-muted)' }}>…</span>
                          ) : history.length === 0 ? (
                            <span className="text-xs" style={{ color: 'var(--am-muted)' }}>{t('historyEmpty')}</span>
                          ) : (
                            <ul className="space-y-1">
                              {history.map((h) => (
                                <li key={h.id} className="text-[11px] font-mono flex items-center gap-3" style={{ color: 'var(--am-muted)' }}>
                                  <span>{formatDate(h.effective_from)}</span>
                                  <span style={{ color: h.active ? 'var(--am-green)' : 'var(--am-muted)' }}>
                                    {h.unit === 'per_1m_tokens'
                                      ? `in ${h.input_usd_per_1m} / out ${h.output_usd_per_1m}`
                                      : `${h.usd_per_minute}/min`}
                                  </span>
                                  {h.active && <span>({t('activeVersion')})</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
