'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { updateOrgIntentWeights, getOrgIntentWeights } from '@/lib/services/intent'
import { INTENT_WEIGHT_CONSTRAINTS, validateIntentWeights } from '@/lib/constants/intent'
import type { OrgIntentWeights } from '@/lib/types'

interface IntentWeightsManagerProps {
  orgId: string
  initialWeights: OrgIntentWeights
}

export function IntentWeightsManager({ orgId, initialWeights }: IntentWeightsManagerProps) {
  const t = useTranslations('Intent')
  const [weights, setWeights] = useState(initialWeights)
  const [isLoading, setIsLoading] = useState(false)

  // Fetch current weights from server on mount to ensure we have the latest
  useEffect(() => {
    const loadWeights = async () => {
      setIsLoading(true)
      try {
        const currentWeights = await getOrgIntentWeights(orgId)
        setWeights(currentWeights)
      } catch {
        // Fallback to initialWeights if fetch fails
        setWeights(initialWeights)
      } finally {
        setIsLoading(false)
      }
    }
    loadWeights()
  }, [orgId, initialWeights])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const totalWeight = weights.financial + weights.urgency + weights.authority + weights.engagement

  const handleWeightChange = (signal: keyof OrgIntentWeights, value: number) => {
    if (signal !== 'orgId' && signal !== 'updatedAt') {
      setWeights((prev) => ({
        ...prev,
        [signal]: Math.max(INTENT_WEIGHT_CONSTRAINTS.MIN, Math.min(INTENT_WEIGHT_CONSTRAINTS.MAX, value)),
      }))
      setError(null)
    }
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
      const result = await updateOrgIntentWeights(orgId, {
        financial: weights.financial,
        urgency: weights.urgency,
        authority: weights.authority,
        engagement: weights.engagement,
      })

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
    <div className="rounded-2xl p-5 border" style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}>
      <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--am-text)' }}>
        {t('configTitle')}
      </p>
      <p className="text-[11px] mb-6" style={{ color: 'var(--am-muted)' }}>
        {t('configSubtitle')}
      </p>

      <div className="space-y-4 mb-6">
        {(['financial', 'urgency', 'authority', 'engagement'] as const).map((signal) => (
          <div key={signal} className="flex items-center justify-between gap-4">
            <label className="text-sm font-medium flex-1" style={{ color: 'var(--am-text)' }}>
              {t(`signals.${signal}.name`)}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="10"
                value={weights[signal]}
                onChange={(e) => handleWeightChange(signal, Number(e.target.value))}
                className="w-16 px-2 py-1 rounded border text-sm outline-none"
                style={{
                  background: 'var(--am-bg3)',
                  borderColor: 'var(--am-border)',
                  color: 'var(--am-text)',
                }}
              />
              <span className="text-xs w-8" style={{ color: 'var(--am-muted)' }}>/10</span>
            </div>
          </div>
        ))}
      </div>

      {/* Total weight indicator */}
      <div className="flex items-center justify-between mb-4 p-3 rounded" style={{ background: 'var(--am-bg3)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--am-text)' }}>
          Total Weight
        </span>
        <span
          className="text-sm font-mono font-bold"
          style={{
            color: totalWeight !== INTENT_WEIGHT_CONSTRAINTS.TOTAL ? 'var(--am-red)' : 'var(--am-green)',
          }}
        >
          {totalWeight}/{INTENT_WEIGHT_CONSTRAINTS.TOTAL}
        </span>
      </div>

      {/* Error message */}
      {error && (
        <p className="text-xs mb-4 p-2 rounded" style={{ background: 'rgba(255,94,94,0.1)', color: 'var(--am-red)' }}>
          {error}
        </p>
      )}

      {/* Success message */}
      {success && (
        <p className="text-xs mb-4 p-2 rounded" style={{ background: 'rgba(34,217,160,0.1)', color: 'var(--am-green)' }}>
          Weights updated successfully
        </p>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || totalWeight !== INTENT_WEIGHT_CONSTRAINTS.TOTAL}
        className="w-full px-4 py-2 rounded-lg font-medium text-sm transition-opacity"
        style={{
          background: totalWeight !== INTENT_WEIGHT_CONSTRAINTS.TOTAL ? 'var(--am-muted)' : 'var(--am-accent)',
          color: '#fff',
          opacity: saving ? 0.7 : 1,
          cursor: saving || totalWeight !== INTENT_WEIGHT_CONSTRAINTS.TOTAL ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? 'Saving...' : 'Save Intent Weights'}
      </button>
    </div>
  )
}
