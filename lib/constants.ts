import type { CallResult } from '@/lib/types'

// ── CallOutcome is an alias of CallResult — single source of truth in lib/types.ts
export type CallOutcome = CallResult

export const CALL_OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: 'closed',     label: 'Closed' },
  { value: 'partial',    label: 'Partial' },
  { value: 'not_closed', label: 'Not Closed' },
  { value: 'no_outcome', label: 'No Outcome' },
]

// ── Result display styles (keyed by canonical outcome value) ─────────────────
export const RESULT_STYLES: Record<CallOutcome, { bg: string; color: string; label: string }> = {
  closed:     { bg: 'var(--am-green-bg)', color: 'var(--am-green)', label: 'Closed' },
  partial:    { bg: 'var(--am-amber-bg)', color: 'var(--am-amber)', label: 'Partial' },
  not_closed: { bg: 'var(--am-red-bg)',   color: 'var(--am-red)',   label: 'Not Closed' },
  no_outcome: { bg: 'var(--am-bg4)',      color: 'var(--am-muted)', label: 'No Outcome' },
}

export const DEFAULT_RESULT_STYLE = { bg: 'var(--am-bg4)', color: 'var(--am-muted)', label: 'Unknown' }

const CANONICAL_OUTCOMES = new Set<CallOutcome>(['closed', 'partial', 'not_closed', 'no_outcome'])

const LEGACY_OUTCOME_MAP: Record<string, CallOutcome> = {
  // Legacy values from before the 022 ENUM migration
  'follow_up':            'partial',
  'follow-up':            'partial',
  'objection_unresolved': 'not_closed',
  'no_decision':          'no_outcome',
  'no-close':             'no_outcome',
  'no_close':             'no_outcome',
}

/** Normalise legacy/inconsistent outcome strings to canonical CallOutcome.
 *  Returns null for unknown values (caller decides fallback).
 */
export function normaliseOutcome(raw: string): CallOutcome | null {
  if (CANONICAL_OUTCOMES.has(raw as CallOutcome)) return raw as CallOutcome
  return LEGACY_OUTCOME_MAP[raw] ?? null
}

// ── Scoring caps applied to overallScore (1–5), keyed by outcome ─────────────
// Section scores themselves are NEVER capped — only the rolled-up overall.
export const OUTCOME_OVERALL_CAP: Record<CallOutcome, number> = {
  closed:     5.0,
  partial:    4.0,
  not_closed: 3.0,
  no_outcome: 2.5,
}
