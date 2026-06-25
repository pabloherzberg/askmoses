'use client'

import { useState } from 'react'

type Stage2 = 'paying' | 'not_paying' | 'pending'

// Marcação do Stage 2 (Actual Close / paying client) no detalhe da call.
// SEPARADO do Initial Result (Stage 1). Visível só para owner/admin. Persiste
// via PATCH /api/calls/[id]/stage2 — ao virar 'paying' grava o snapshot de
// intent (loop de aprendizado).
const STYLES: Record<Stage2, { label: string; bg: string; color: string }> = {
  paying: { label: 'Paying client', bg: 'rgba(34,217,160,0.12)', color: 'var(--am-green)' },
  not_paying: { label: 'Not paying', bg: 'rgba(255,94,94,0.12)', color: 'var(--am-red)' },
  pending: { label: 'Pending', bg: 'var(--am-bg4)', color: 'var(--am-muted)' },
}

export function Stage2Marker({
  callId,
  initial,
}: {
  callId: string
  initial: Stage2 | null
}) {
  const [value, setValue] = useState<Stage2 | null>(initial)
  const [saving, setSaving] = useState<Stage2 | null>(null)
  const [error, setError] = useState(false)

  const mark = async (next: Stage2) => {
    setSaving(next)
    setError(false)
    try {
      const res = await fetch(`/api/calls/${callId}/stage2`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage2Outcome: next }),
      })
      const json = await res.json()
      if (json?.data?.stage2Outcome) {
        setValue(json.data.stage2Outcome as Stage2)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div
      className="rounded-2xl p-4 border mb-4"
      style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[12px] font-medium" style={{ color: 'var(--am-text)' }}>
            Stage 2 — Actual Close
          </p>
          <p className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
            Did this lead become a paying client? (separate from the Initial Result)
          </p>
        </div>
        {value && (
          <span
            className="text-[11px] font-medium px-2.5 py-1 rounded-full font-mono"
            style={{ background: STYLES[value].bg, color: STYLES[value].color }}
          >
            {STYLES[value].label}
          </span>
        )}
      </div>

      <div className="flex gap-2 mt-3 flex-wrap">
        {(['paying', 'not_paying', 'pending'] as Stage2[]).map((s) => {
          const active = value === s
          return (
            <button
              key={s}
              type="button"
              onClick={() => mark(s)}
              disabled={saving !== null}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all disabled:opacity-50"
              style={{
                background: active ? STYLES[s].color : 'var(--am-bg3)',
                color: active ? '#fff' : 'var(--am-muted)',
              }}
            >
              {saving === s ? 'Saving…' : STYLES[s].label}
            </button>
          )
        })}
      </div>

      {error && (
        <p className="text-[11px] mt-2" style={{ color: 'var(--am-red)' }}>
          Failed to update. Try again.
        </p>
      )}
    </div>
  )
}
