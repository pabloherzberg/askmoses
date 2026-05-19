'use client'

import { useEffect, useState } from 'react'
import { X, Send } from 'lucide-react'
import { useTranslations } from 'next-intl'

type Mode = 'scripts' | 'rubrics'

interface CatalogScript {
  id: string
  name: string
  description: string | null
  version: string
  majorVersion: number
  minorVersion: number
  rubricId: string
  rubricName: string | null
  rubricVersion: number | null
  isTemplate: boolean
}

interface CatalogRubric {
  id: string
  name: string
  description: string | null
  version: number
  isActive: boolean
  scriptCount: number
}

interface Props {
  open: boolean
  // Quando recebe orgIds.length === 1, mostra subtítulo singular com orgName.
  // Quando > 1, subtítulo plural com a contagem.
  orgIds: string[]
  // Map orgId → name pra renderizar o subtítulo single. Caller passa o map
  // completo da página pra evitar fetch redundante; só uma entrada é usada.
  orgNames: Record<string, string>
  onClose: () => void
  // Callback após sucesso pra parent recarregar dados (router.refresh).
  onSent: (count: number) => void
}

// Modal de Send Script. Pill toggle entre dois modos:
//   - "Scripts": lista todos os scripts (com badge da rubric pai) e envia
//     a versão específica selecionada.
//   - "Rubrics": lista rubrics — backend resolve o script mais recente
//     dessa rubric e envia.
//
// Bulk e single usam o mesmo fluxo — a diferença é só quantos orgIds estão
// no array.
export function SendScriptModal({ open, orgIds, orgNames, onClose, onSent }: Props) {
  const t = useTranslations('Admin.sendScriptModal')

  const [mode, setMode] = useState<Mode>('scripts')
  const [scripts, setScripts] = useState<CatalogScript[] | null>(null)
  const [rubrics, setRubrics] = useState<CatalogRubric[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state on open/close pra modal não vazar seleção entre invocações.
  useEffect(() => {
    if (!open) {
      setMode('scripts')
      setSelectedId(null)
      setSending(false)
      setError(null)
      return
    }
    let cancelled = false
    setScripts(null)
    setRubrics(null)

    // Carrega scripts + rubrics em paralelo — o usuário pode trocar de modo
    // sem precisar de novo round trip.
    Promise.all([
      fetch('/api/admin/scripts/catalog').then((r) => r.json()),
      fetch('/api/admin/rubrics/catalog').then((r) => r.json()),
    ])
      .then(([scriptsJson, rubricsJson]) => {
        if (cancelled) return
        if (scriptsJson?.data) setScripts(scriptsJson.data)
        if (rubricsJson?.data) setRubrics(rubricsJson.data)
        if (!scriptsJson?.data && !rubricsJson?.data) setError(t('genericError'))
      })
      .catch(() => {
        if (!cancelled) setError(t('genericError'))
      })
    return () => {
      cancelled = true
    }
  }, [open, t])

  // ESC pra fechar — padrão de modal acessível.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, sending, onClose])

  if (!open) return null

  const isBulk = orgIds.length > 1
  const subtitle = isBulk
    ? t('subtitleBulk', { count: orgIds.length })
    : t('subtitleSingle', { name: orgNames[orgIds[0]] ?? '?' })

  // Trocar de modo limpa seleção — IDs de scripts e rubrics são UUIDs
  // diferentes, então não há ambiguidade, mas mantém a UX clara.
  const setModeAndClear = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    setSelectedId(null)
  }

  const handleSend = async () => {
    if (!selectedId || sending) return
    setSending(true)
    setError(null)
    try {
      const body =
        mode === 'scripts'
          ? { scriptId: selectedId, orgIds }
          : { rubricId: selectedId, orgIds }
      const res = await fetch('/api/admin/scripts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? t('genericError'))
        setSending(false)
        return
      }
      onSent(orgIds.length)
    } catch {
      setError(t('genericError'))
      setSending(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onClose()
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border overflow-hidden"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        <div
          className="flex items-start justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--am-border)' }}
        >
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--am-text)' }}>
              {t('title')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--am-muted)' }}>
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label={t('cancel')}
            className="p-1 rounded hover:opacity-80 transition-opacity"
            style={{ color: 'var(--am-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Pill toggle Scripts | Rubrics */}
        <div className="px-5 pt-4">
          <div
            className="inline-flex rounded-full p-0.5 border"
            style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)' }}
            role="tablist"
          >
            {(['scripts', 'rubrics'] as const).map((m) => {
              const active = mode === m
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setModeAndClear(m)}
                  disabled={sending}
                  className="px-4 py-1 rounded-full text-xs font-medium transition-colors"
                  style={{
                    background: active ? 'var(--am-accent)' : 'transparent',
                    color: active ? 'var(--am-on-accent)' : 'var(--am-muted)',
                  }}
                >
                  {m === 'scripts' ? t('modeScripts') : t('modeRubrics')}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] mt-2" style={{ color: 'var(--am-muted)' }}>
            {t('modeHint')}
          </p>
        </div>

        <div className="px-5 py-4 max-h-[55vh] overflow-y-auto">
          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--am-muted)' }}>
            {mode === 'scripts' ? t('chooseScript') : t('chooseRubric')}
          </p>

          {mode === 'scripts' && (
            <ScriptsList
              scripts={scripts}
              selectedId={selectedId}
              onSelect={setSelectedId}
              disabled={sending}
              t={t}
            />
          )}
          {mode === 'rubrics' && (
            <RubricsList
              rubrics={rubrics}
              selectedId={selectedId}
              onSelect={setSelectedId}
              disabled={sending}
              t={t}
            />
          )}

          {error && (
            <p
              role="alert"
              className="text-xs mt-3 px-3 py-2 rounded-md border"
              style={{
                background: 'var(--am-red-bg)',
                borderColor: 'var(--am-red)',
                color: 'var(--am-red)',
              }}
            >
              {error}
            </p>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: '1px solid var(--am-border)' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="px-3 py-1.5 rounded-md text-sm transition-opacity disabled:opacity-50"
            style={{ color: 'var(--am-muted)' }}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!selectedId || sending}
            className="px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-opacity disabled:opacity-50"
            style={{ background: 'var(--am-accent)', color: 'var(--am-on-accent)' }}
          >
            <Send size={14} />
            {sending ? t('sending') : t('send')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-listas ────────────────────────────────────────────────────────────

type T = ReturnType<typeof useTranslations<'Admin.sendScriptModal'>>

function Skeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-14 rounded-lg animate-pulse"
          style={{ background: 'var(--am-bg3)' }}
        />
      ))}
    </div>
  )
}

function ScriptsList({
  scripts,
  selectedId,
  onSelect,
  disabled,
  t,
}: {
  scripts: CatalogScript[] | null
  selectedId: string | null
  onSelect: (id: string) => void
  disabled: boolean
  t: T
}) {
  if (scripts === null) return <Skeleton />
  if (scripts.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--am-muted)' }}>
        {t('noScripts')}
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {scripts.map((s) => {
        const selected = s.id === selectedId
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            disabled={disabled}
            className="w-full text-left rounded-lg px-3 py-3 border transition-colors"
            style={{
              background: selected ? 'var(--am-accent-bg, rgba(110,86,255,0.12))' : 'var(--am-bg3)',
              borderColor: selected ? 'var(--am-accent)' : 'var(--am-border)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p
                className="text-sm font-medium"
                style={{ color: selected ? 'var(--am-accent2)' : 'var(--am-text)' }}
              >
                {s.name}
              </p>
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap"
                style={{ background: 'var(--am-bg4)', color: 'var(--am-muted)' }}
              >
                v{s.version}
              </span>
            </div>
            {s.rubricName && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--am-muted)' }}>
                {t('rubricLabel', { name: s.rubricName })}
              </p>
            )}
            {s.description && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--am-muted)' }}>
                {s.description}
              </p>
            )}
          </button>
        )
      })}
    </div>
  )
}

function RubricsList({
  rubrics,
  selectedId,
  onSelect,
  disabled,
  t,
}: {
  rubrics: CatalogRubric[] | null
  selectedId: string | null
  onSelect: (id: string) => void
  disabled: boolean
  t: T
}) {
  if (rubrics === null) return <Skeleton />
  if (rubrics.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--am-muted)' }}>
        {t('noRubrics')}
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {rubrics.map((r) => {
        const selected = r.id === selectedId
        // Rubric sem scripts não pode ser enviada — desabilita seleção.
        const sendable = r.scriptCount > 0
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => sendable && onSelect(r.id)}
            disabled={disabled || !sendable}
            title={!sendable ? t('noScripts') : undefined}
            className="w-full text-left rounded-lg px-3 py-3 border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: selected ? 'var(--am-accent-bg, rgba(110,86,255,0.12))' : 'var(--am-bg3)',
              borderColor: selected ? 'var(--am-accent)' : 'var(--am-border)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p
                className="text-sm font-medium"
                style={{ color: selected ? 'var(--am-accent2)' : 'var(--am-text)' }}
              >
                {r.name}
              </p>
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap"
                style={{ background: 'var(--am-bg4)', color: 'var(--am-muted)' }}
              >
                {t('rubricVersion', { version: r.version })}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
                {t('scriptCount', { count: r.scriptCount })}
              </span>
              {r.description && (
                <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
                  · {r.description}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
