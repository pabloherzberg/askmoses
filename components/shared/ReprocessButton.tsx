'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { RefreshCw, AlertCircle } from 'lucide-react'

// Extraído de app/[locale]/calls/CallsTable.tsx para ser compartilhado com a
// tela de detalhe: quando o CallDetail diz "não foi possível transcrever",
// oferecer a ação ali é o mínimo — mandar a pessoa procurar a mesma call na
// tabela para clicar num botão é atrito sem motivo.
//
// Quem decide se o botão FAZ SENTIDO é canReprocess (lib/call-state.ts): só
// falha de pipeline. no_recording não tem o que reprocessar, e não-venda é o
// classificador tendo acertado.

const REFRESH_INTERVAL_MS = 8_000
const REFRESH_MAX = 45 // ~6 minutos

type ReprocessState = 'idle' | 'loading' | 'queued' | 'error'

export function ReprocessButton({ callId, hasSections, onRefresh }: { callId: string; hasSections: boolean; onRefresh: () => void }) {
  const [state, setState] = useState<ReprocessState>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const t = useTranslations('Owner.calls.reprocess')

  // Quando em 'queued', faz refresh periódico. O pai para de renderizar
  // este botão quando sections chegarem (análise finalizada).
  useEffect(() => {
    if (state !== 'queued') return
    let count = 0
    const id = setInterval(() => {
      count++
      onRefresh()
      if (count >= REFRESH_MAX) clearInterval(id)
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [state, onRefresh])

  // Sections chegaram — o pai vai desmontar este componente, mas se por algum
  // motivo ainda estiver montado, muda estado local para idle.
  useEffect(() => {
    if (state === 'queued' && hasSections) setState('idle')
  }, [hasSections, state])

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (state !== 'idle') return
    setState('loading')
    setErrorMsg('')
    try {
      const res = await fetch(`/api/calls/${callId}/reprocess`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
      }
      setState('queued')
      onRefresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[reprocess]', callId, msg)
      setErrorMsg(msg)
      setState('error')
      setTimeout(() => setState('idle'), 6000)
    }
  }, [callId, state, onRefresh])

  if (state === 'queued') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg whitespace-nowrap"
        style={{ color: 'var(--am-blue)', background: 'rgba(94,179,255,0.12)' }}
      >
        <RefreshCw size={11} className="animate-spin" />
        {t('processing')}
      </span>
    )
  }

  if (state === 'error') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg whitespace-nowrap cursor-help"
        style={{ color: 'var(--am-red)', background: 'rgba(255,94,94,0.12)' }}
        title={errorMsg}
      >
        <AlertCircle size={12} />
        {t('error')}
      </span>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg whitespace-nowrap transition-opacity hover:opacity-80 disabled:opacity-50"
      style={{ color: 'var(--am-amber)', background: 'rgba(255,171,46,0.12)', border: '1px solid rgba(255,171,46,0.25)' }}
      title={t('tooltip')}
    >
      <RefreshCw size={11} className={state === 'loading' ? 'animate-spin' : ''} />
      {state === 'loading' ? t('queuing') : t('label')}
    </button>
  )
}
