'use client'

import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import type { RubricSection } from '@/lib/types'

const colorMap: Record<string, string> = {
  blue:    'var(--am-blue)',
  amber:   'var(--am-amber)',
  green:   'var(--am-green)',
  red:     'var(--am-red)',
  accent2: 'var(--am-accent2)',
}

interface Props {
  sections: RubricSection[]
  systemPrompt: string
}

export function RubricConfigClient({ sections, systemPrompt }: Props) {
  const { toast } = useToast()
  const [criticalMap, setCriticalMap] = useState<Record<string, boolean>>(
    Object.fromEntries(sections.map((s) => [s.id, s.isCritical]))
  )

  const toggleCritical = (id: string) =>
    setCriticalMap((prev) => ({ ...prev, [id]: !prev[id] }))

  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      // Bulk replace criteria with current critical state
      const criteriaPayload = sections.map((s, i) => ({
        name: s.name,
        description: s.description || null,
        sortOrder: i,
      }))

      const res = await fetch('/api/rubric/criteria', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria: criteriaPayload }),
      })

      if (!res.ok) throw new Error('Failed to save')

      toast({
        title: 'Saved',
        description: 'Rubric criteria updated successfully.',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save rubric changes. Try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Section cards */}
      <div className="flex flex-col gap-3 mb-6">
        {sections.map((section) => {
          const isCritical = criticalMap[section.id]
          const accentColor = colorMap[section.color] ?? 'var(--am-accent)'

          return (
            <div
              key={section.id}
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
                      {section.name}
                    </p>
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--am-bg4)', color: 'var(--am-muted)' }}
                    >
                      {section.weight}%
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--am-muted)' }}>
                    {section.description}
                  </p>
                </div>
              </div>

              {/* Critical toggle */}
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <span className="text-xs" style={{ color: 'var(--am-muted)' }}>
                  {isCritical ? 'Critical' : 'Optional'}
                </span>
                <button
                  onClick={() => toggleCritical(section.id)}
                  className="relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200"
                  style={{
                    background: isCritical ? 'var(--am-accent)' : 'var(--am-bg4)',
                  }}
                  aria-label={`Toggle ${section.name} critical`}
                >
                  <span
                    className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 mt-0.5"
                    style={{
                      transform: isCritical ? 'translateX(18px)' : 'translateX(2px)',
                    }}
                  />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* AI prompt preview */}
      <div
        className="rounded-2xl p-5 border mb-6"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--am-text)' }}>
          AI System Prompt Preview
        </p>
        <p className="text-xs mb-3" style={{ color: 'var(--am-muted)' }}>
          This prompt is sent to the AI on every call analysis. Read-only in this demo.
        </p>
        <textarea
          readOnly
          rows={10}
          value={systemPrompt}
          className="w-full text-xs font-mono leading-relaxed rounded-lg px-3 py-2.5 resize-none outline-none border"
          style={{
            background:  'var(--am-bg3)',
            borderColor: 'var(--am-border)',
            color:       'var(--am-muted)',
          }}
        />
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: 'var(--am-accent)' }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
