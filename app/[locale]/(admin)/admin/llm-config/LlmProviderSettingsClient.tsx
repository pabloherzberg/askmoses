'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Eye, EyeOff } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { SectionLabel } from '@/components/shared/SectionLabel'
import type { LlmProvider, LlmProviderSetting } from '@/lib/types'

const PROVIDER_MODELS: Record<LlmProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
  gemini: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ],
}

interface Props {
  initialProviders: LlmProviderSetting[]
}

type DraftMap = Record<LlmProvider, { model: string; apiKey: string }>

export function LlmProviderSettingsClient({ initialProviders }: Props) {
  const t = useTranslations('Admin.llmConfig.providerSection')
  const { toast } = useToast()

  const [providers, setProviders] = useState<LlmProviderSetting[]>(initialProviders)
  const [showKey, setShowKey] = useState<Record<LlmProvider, boolean>>({ openai: false, gemini: false })
  const [saving, setSaving] = useState<LlmProvider | null>(null)
  const [activating, setActivating] = useState<LlmProvider | null>(null)

  const [drafts, setDrafts] = useState<DraftMap>(() => {
    const base: DraftMap = { openai: { model: '', apiKey: '' }, gemini: { model: '', apiKey: '' } }
    for (const p of initialProviders) {
      base[p.provider] = { model: p.model, apiKey: '' }
    }
    return base
  })

  if (providers.length === 0) {
    return (
      <div>
        <SectionLabel>{t('label')}</SectionLabel>
        <div
          className="rounded-2xl border p-5 text-sm"
          style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)', color: 'var(--am-muted)' }}
        >
          {t('notMigrated')}
        </div>
      </div>
    )
  }

  const updateDraft = (provider: LlmProvider, field: 'model' | 'apiKey', value: string) => {
    setDrafts((prev) => ({ ...prev, [provider]: { ...prev[provider], [field]: value } }))
  }

  // PREVIEW VISUAL — ainda não funcional. Sem fetch, sem persistência real:
  // só atualiza o estado local pra mostrar como a tela vai se comportar.
  // /api/analyze continua 100% hardcoded em OpenAI/env, sem depender disso.
  const handleSave = async (provider: LlmProvider) => {
    const draft = drafts[provider]
    setSaving(provider)
    await new Promise((r) => setTimeout(r, 300))
    setProviders((prev) =>
      prev.map((p) =>
        p.provider === provider
          ? { ...p, model: draft.model, hasKey: draft.apiKey.trim() ? true : p.hasKey, updated_at: new Date().toISOString() }
          : p,
      ),
    )
    updateDraft(provider, 'apiKey', '')
    toast({ title: t('toastPreviewTitle'), description: t('toastPreviewBody') })
    setSaving(null)
  }

  const handleActivate = async (provider: LlmProvider) => {
    setActivating(provider)
    await new Promise((r) => setTimeout(r, 300))
    setProviders((prev) => prev.map((p) => ({ ...p, is_active: p.provider === provider })))
    toast({ title: t('toastPreviewTitle'), description: t('toastPreviewBody') })
    setActivating(null)
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

      <div className="grid gap-4 md:grid-cols-2">
        {providers.map((p) => {
          const draft = drafts[p.provider]
          const models = PROVIDER_MODELS[p.provider]
          const isSaving = saving === p.provider
          const isActivating = activating === p.provider

          return (
            <div
              key={p.provider}
              className="rounded-2xl border p-5 flex flex-col gap-4"
              style={{
                background: 'var(--am-bg2)',
                borderColor: p.is_active ? 'var(--am-accent)' : 'var(--am-border)',
              }}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold" style={{ color: 'var(--am-text)' }}>
                  {p.provider === 'openai' ? t('providerOpenAI') : t('providerGemini')}
                </p>
                {p.is_active ? (
                  <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-widest"
                    style={{ background: 'var(--am-accent)', color: 'white' }}
                  >
                    {t('activeProvider')}
                  </span>
                ) : (
                  <button
                    onClick={() => handleActivate(p.provider)}
                    disabled={isActivating}
                    className="text-xs font-medium px-3 py-1 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ background: 'var(--am-bg4)', color: 'var(--am-text)' }}
                  >
                    {isActivating ? t('saving') : t('setActive')}
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--am-text)' }}>
                  {t('modelLabel')}
                </label>
                <select
                  value={draft.model}
                  onChange={(e) => updateDraft(p.provider, 'model', e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'var(--am-bg)', border: '1px solid var(--am-border)', color: 'var(--am-text)' }}
                >
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium" style={{ color: 'var(--am-text)' }}>
                    {t('apiKeyLabel')}
                  </label>
                  <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded"
                    style={{
                      background: 'var(--am-bg4)',
                      color: p.hasKey ? 'var(--am-green)' : 'var(--am-muted)',
                    }}
                  >
                    {p.hasKey ? `${t('keyConfigured')} · ${p.keyHint}` : t('keyMissing')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type={showKey[p.provider] ? 'text' : 'password'}
                    value={draft.apiKey}
                    onChange={(e) => updateDraft(p.provider, 'apiKey', e.target.value)}
                    placeholder={t('apiKeyPlaceholder')}
                    autoComplete="off"
                    className="flex-1 rounded-lg px-3 py-2 font-mono text-sm outline-none"
                    style={{ background: 'var(--am-bg)', border: '1px solid var(--am-border)', color: 'var(--am-text)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((prev) => ({ ...prev, [p.provider]: !prev[p.provider] }))}
                    className="p-2 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: 'var(--am-bg4)', color: 'var(--am-muted)' }}
                    aria-label={showKey[p.provider] ? t('apiKeyHide') : t('apiKeyShow')}
                  >
                    {showKey[p.provider] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-[10px]" style={{ color: 'var(--am-muted)' }}>
                  {p.updated_by ? `${p.updated_by} · ${new Date(p.updated_at).toLocaleDateString('pt-BR')}` : ''}
                </p>
                <button
                  onClick={() => handleSave(p.provider)}
                  disabled={isSaving}
                  className="text-xs font-semibold px-4 py-1.5 rounded-lg transition-opacity disabled:opacity-40"
                  style={{ background: 'var(--am-accent)', color: 'white' }}
                >
                  {isSaving ? t('saving') : t('save')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
