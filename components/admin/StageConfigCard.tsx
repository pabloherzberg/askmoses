'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import type { CallResult } from '@/lib/types'
import type { OrgStageConfig } from '@/lib/services/stage-config'

const OUTCOMES: CallResult[] = ['closed', 'partial', 'not_closed', 'no_outcome']

// Config dos dois estágios do funil para o owner. Stage 1 = quais outcomes
// contam como "agendou o intro offer"; Stage 2 = como a org descreve paying
// client. Owner-scoped via /api/stage-config.
export function StageConfigCard() {
  const tOutcomes = useTranslations('Shared.outcomes')
  const [stage1, setStage1] = useState<CallResult[]>(['closed'])
  const [stage2Label, setStage2Label] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/stage-config')
      .then((r) => r.json())
      .then((json) => {
        const cfg = json?.data?.config as OrgStageConfig | null
        if (cfg) {
          setStage1(cfg.stage1SuccessOutcomes ?? ['closed'])
          setStage2Label(cfg.stage2SuccessLabel ?? '')
        }
      })
      .catch(() => {})
  }, [])

  const toggleOutcome = (o: CallResult) => {
    setStage1((prev) => (prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]))
    setError(null)
  }

  const handleSave = async () => {
    if (stage1.length === 0) {
      setError('Select at least one outcome for Stage 1 success')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/stage-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage1SuccessOutcomes: stage1, stage2SuccessLabel: stage2Label || null }),
      })
      const json = await res.json()
      if (json?.data?.config) {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      } else {
        setError(json?.data?.error || 'Failed to save')
      }
    } catch {
      setError('Error saving stage config')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="rounded-2xl p-5 border mt-6"
      style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
    >
      <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--am-text)' }}>
        Funnel Stages — what counts as success
      </p>
      <p className="text-[11px] mb-5" style={{ color: 'var(--am-muted)' }}>
        Two different moments of the funnel. Intent is not success — these define success.
      </p>

      {/* Stage 1 */}
      <div className="mb-5">
        <p className="text-[12px] font-medium mb-2" style={{ color: 'var(--am-text)' }}>
          Stage 1 — Initial Result <span style={{ color: 'var(--am-muted)' }}>(booked the intro offer)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {OUTCOMES.map((o) => {
            const active = stage1.includes(o)
            return (
              <button
                key={o}
                type="button"
                onClick={() => toggleOutcome(o)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                style={{
                  background: active ? 'var(--am-accent)' : 'var(--am-bg3)',
                  color: active ? '#fff' : 'var(--am-muted)',
                }}
              >
                {tOutcomes(`short.${o}`)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Stage 2 */}
      <div className="mb-5">
        <p className="text-[12px] font-medium mb-2" style={{ color: 'var(--am-text)' }}>
          Stage 2 — Actual Close <span style={{ color: 'var(--am-muted)' }}>(paying client)</span>
        </p>
        <input
          type="text"
          value={stage2Label}
          onChange={(e) => setStage2Label(e.target.value)}
          placeholder="e.g. Paid the monthly training package"
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)', color: 'var(--am-text)' }}
        />
      </div>

      {error && (
        <p className="text-xs mb-3 p-2 rounded" style={{ background: 'rgba(255,94,94,0.1)', color: 'var(--am-red)' }}>
          {error}
        </p>
      )}
      {success && (
        <p className="text-xs mb-3 p-2 rounded" style={{ background: 'rgba(34,217,160,0.1)', color: 'var(--am-green)' }}>
          Stage config saved
        </p>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: 'var(--am-accent)' }}
        >
          {saving ? 'Saving...' : 'Save Stages'}
        </button>
      </div>
    </div>
  )
}
