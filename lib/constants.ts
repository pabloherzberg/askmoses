import type { CallResult } from '@/lib/types'

// ── CallOutcome is an alias of CallResult — single source of truth in lib/types.ts
export type CallOutcome = CallResult

export const CALL_OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: 'closed',               label: 'Closed' },
  { value: 'follow_up',            label: 'Follow-up' },
  { value: 'objection_unresolved', label: 'Objection Unresolved' },
  { value: 'no_decision',          label: 'No Decision' },
]

// ── Result display styles (keyed by canonical outcome value) ─────────────────
export const RESULT_STYLES: Record<CallOutcome, { bg: string; color: string; label: string }> = {
  closed:               { bg: 'var(--am-green-bg)', color: 'var(--am-green)',  label: 'Closed' },
  follow_up:            { bg: 'var(--am-amber-bg)', color: 'var(--am-amber)',  label: 'Follow-up' },
  objection_unresolved: { bg: 'var(--am-amber-bg)', color: 'var(--am-amber)',  label: 'Objection' },
  no_decision:          { bg: 'var(--am-red-bg)',   color: 'var(--am-red)',    label: 'No Decision' },
}

export const DEFAULT_RESULT_STYLE = { bg: 'var(--am-bg4)', color: 'var(--am-muted)', label: 'Unknown' }

/** Normalise legacy/inconsistent outcome strings to canonical CallOutcome */
export function normaliseOutcome(raw: string): CallOutcome {
  const map: Record<string, CallOutcome> = {
    'follow-up':  'follow_up',
    'no-close':   'no_decision',
    'no_close':   'no_decision',
  }
  return (map[raw] ?? raw) as CallOutcome
}
