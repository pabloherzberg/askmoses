'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck } from 'lucide-react'

/**
 * Marca todas as recomendações do trainer como lidas (PATCH no endpoint que
 * já existia). Depois de salvar, router.refresh() re-renderiza a lista
 * server-side com o estado atualizado.
 */
export function MarkAllReadButton({ label }: { label: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const handleClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      await fetch('/api/coaching/notifications', { method: 'PATCH' })
      router.refresh()
    } catch {
      // Silencioso — o próximo carregamento reconcilia o estado.
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-opacity hover:opacity-80 disabled:opacity-40 flex-shrink-0"
      style={{ borderColor: 'var(--am-border)', color: 'var(--am-muted)' }}
    >
      <CheckCheck size={14} />
      {label}
    </button>
  )
}
