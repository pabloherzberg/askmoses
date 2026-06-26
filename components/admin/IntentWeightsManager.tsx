'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { updateOrgIntentWeights, getOrgIntentWeights } from '@/lib/services/intent'
import { INTENT_WEIGHT_CONSTRAINTS, INTENT_SIGNAL_IDS, validateIntentWeights } from '@/lib/constants/intent'
import type { OrgIntentWeights } from '@/lib/types'

interface IntentWeightsManagerProps {
  orgId: string
  initialWeights: OrgIntentWeights
  // 'admin' (default): painel SaaS, escolhe org via orgId → /api/admin/intent-weights.
  // 'owner': owner configura a própria org ativa → /api/intent-weights (sem orgId).
  scope?: 'admin' | 'owner'
}

// Helpers owner-scoped: batem em /api/intent-weights, que resolve a org pelo
// contexto da sessão. Mantém o IntentWeightsManager reusável entre admin e owner.
async function getOwnerIntentWeights(): Promise<OrgIntentWeights | null> {
  try {
    const res = await fetch('/api/intent-weights')
    const json = await res.json()
    return json?.data?.weights ?? null
  } catch {
    return null
  }
}

async function updateOwnerIntentWeights(
  weights: Pick<OrgIntentWeights, 'financial' | 'urgency' | 'authority' | 'engagement'>,
): Promise<OrgIntentWeights | null> {
  const res = await fetch('/api/intent-weights', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(weights),
  })
  const json = await res.json()
  return json?.data?.weights ?? null
}

// Cores por sinal — mesmas do radar/mock (financial=red, etc.). Espelha a
// mecânica visual do rubric (dot de cor + nome + badge de peso + descrição).
const SIGNAL_COLORS: Record<string, string> = {
  financial: 'var(--am-red)',
  urgency: 'var(--am-amber)',
  authority: 'var(--am-blue)',
  engagement: 'var(--am-accent2)',
}

export function IntentWeightsManager({ orgId, initialWeights, scope = 'admin' }: IntentWeightsManagerProps) {
  const t = useTranslations('Intent')
  const [weights, setWeights] = useState(initialWeights)

  // Fetch current weights from server on mount to ensure we have the latest
  useEffect(() => {
    const loadWeights = async () => {
      try {
        const currentWeights =
          scope === 'owner'
            ? (await getOwnerIntentWeights()) ?? initialWeights
            : await getOrgIntentWeights(orgId)
        setWeights(currentWeights)
      } catch {
        setWeights(initialWeights)
      }
    }
    loadWeights()
  }, [orgId, initialWeights, scope])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const totalWeight = weights.financial + weights.urgency + weights.authority + weights.engagement
  const isValid = totalWeight === INTENT_WEIGHT_CONSTRAINTS.TOTAL

  const handleWeightChange = (signal: (typeof INTENT_SIGNAL_IDS)[number], value: number) => {
    const clamped = Math.max(
      INTENT_WEIGHT_CONSTRAINTS.MIN,
      Math.min(INTENT_WEIGHT_CONSTRAINTS.MAX, Number.isFinite(value) ? value : 0),
    )
    setWeights((prev) => ({ ...prev, [signal]: clamped }))
    setError(null)
  }

  const handleSave = async () => {
    const validation = validateIntentWeights({
      financial: weights.financial,
      urgency: weights.urgency,
      authority: weights.authority,
      engagement: weights.engagement,
    })

    if (!validation.valid) {
      setError(validation.error || 'Invalid weights')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const payload = {
        financial: weights.financial,
        urgency: weights.urgency,
        authority: weights.authority,
        engagement: weights.engagement,
      }
      const result =
        scope === 'owner'
          ? await updateOwnerIntentWeights(payload)
          : await updateOrgIntentWeights(orgId, payload)

      if (result) {
        setWeights(result)
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      } else {
        setError('Failed to save weights')
      }
    } catch {
      setError('Error saving weights')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--am-text)' }}>
        {t('configTitle')}
      </p>
      <p className="text-[11px] mb-6" style={{ color: 'var(--am-muted)' }}>
        {t('configSubtitle')}
      </p>

      {/* Signal cards — mesma mecânica visual do rubric */}
      <div className="flex flex-col gap-3 mb-6">
        {INTENT_SIGNAL_IDS.map((signal) => {
          const accentColor = SIGNAL_COLORS[signal] ?? 'var(--am-accent)'
          const pct = totalWeight > 0 ? Math.round((weights[signal] / totalWeight) * 100) : 0

          return (
            <div
              key={signal}
              className="rounded-2xl p-5 border flex flex-col sm:flex-row sm:items-start gap-4"
              style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
            >
              {/* Color dot + info */}
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                  style={{ background: accentColor }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
                      {t(`signals.${signal}.name`)}
                    </p>
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--am-bg4)', color: 'var(--am-muted)' }}
                    >
                      {pct}%
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--am-muted)' }}>
                    {t(`signals.${signal}.description`)}
                  </p>
                </div>
              </div>

              {/* Weight input */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  min={INTENT_WEIGHT_CONSTRAINTS.MIN}
                  max={INTENT_WEIGHT_CONSTRAINTS.MAX}
                  value={weights[signal]}
                  onChange={(e) => handleWeightChange(signal, Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded border text-sm outline-none font-mono"
                  style={{
                    background: 'var(--am-bg3)',
                    borderColor: 'var(--am-border)',
                    color: 'var(--am-text)',
                  }}
                  aria-label={t(`signals.${signal}.name`)}
                />
                <span className="text-xs" style={{ color: 'var(--am-muted)' }}>
                  / {INTENT_WEIGHT_CONSTRAINTS.TOTAL}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Total weight indicator */}
      <div
        className="flex items-center justify-between mb-4 p-3 rounded-lg"
        style={{ background: 'var(--am-bg3)' }}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--am-text)' }}>
          Total
        </span>
        <span
          className="text-sm font-mono font-bold"
          style={{ color: isValid ? 'var(--am-green)' : 'var(--am-red)' }}
        >
          {totalWeight}/{INTENT_WEIGHT_CONSTRAINTS.TOTAL}
        </span>
      </div>

      {error && (
        <p
          className="text-xs mb-4 p-2 rounded"
          style={{ background: 'rgba(255,94,94,0.1)', color: 'var(--am-red)' }}
        >
          {error}
        </p>
      )}

      {success && (
        <p
          className="text-xs mb-4 p-2 rounded"
          style={{ background: 'rgba(34,217,160,0.1)', color: 'var(--am-green)' }}
        >
          Weights updated successfully
        </p>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !isValid}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{
            background: !isValid ? 'var(--am-muted)' : 'var(--am-accent)',
            cursor: saving || !isValid ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save Intent Weights'}
        </button>
      </div>
    </div>
  )
}
