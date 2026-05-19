'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface PendingState {
  pending: boolean
  version: string | null
  scriptName: string | null
}

// PendingScriptBadge
//   Exibe um chip amber pequeno no header quando o Owner tem um script
//   aguardando aprovação na org ativa. Para admin/trainer o endpoint sempre
//   retorna { pending: false } e o componente não renderiza nada.
//
//   Re-fetcha quando o pathname muda — o badge atualiza após o Owner aceitar
//   o script (assumindo que a aceitação navega ou triggera router.refresh).
//   Não cria event source (pra não complicar Fase 1 demo) — refresh ao
//   trocar de rota é suficiente.
export function PendingScriptBadge() {
  const t = useTranslations('Shared.header')
  const pathname = usePathname()
  const [state, setState] = useState<PendingState | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me/pending-script')
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return
        if (res?.data) setState(res.data as PendingState)
      })
      .catch(() => {
        // Falha silenciosa — o badge é não-crítico, não vale incomodar o user.
      })
    return () => {
      cancelled = true
    }
  }, [pathname])

  if (!state?.pending) return null

  // Title (tooltip) inclui o nome do script e versão pra contexto sem
  // ocupar espaço visual no chip.
  const tooltip = state.scriptName
    ? `${state.scriptName} v${state.version} ${t('pendingApprovalShort')}`
    : t('pendingApprovalShort')

  return (
    <span
      className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium"
      title={tooltip}
      style={{
        background: 'var(--am-amber-bg)',
        borderColor: 'var(--am-amber)',
        color: 'var(--am-amber)',
      }}
    >
      <AlertCircle size={12} />
      {state.version ? `v${state.version}` : ''}
      <span className="font-mono uppercase tracking-wide text-[10px]">
        {t('pendingApprovalShort')}
      </span>
    </span>
  )
}
