import type { CallResult, LeadSource } from '@/lib/types'

// ── CallOutcome is an alias of CallResult — single source of truth in lib/types.ts
export type CallOutcome = CallResult

export const CALL_OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: 'closed',     label: 'Closed' },
  { value: 'not_closed', label: 'Not Closed' },
]

// ── Result display styles (keyed by canonical outcome value) ─────────────────
export const RESULT_STYLES: Record<CallOutcome, { bg: string; color: string; label: string }> = {
  closed:     { bg: 'var(--am-green-bg)', color: 'var(--am-green)', label: 'Closed' },
  not_closed: { bg: 'var(--am-red-bg)',   color: 'var(--am-red)',   label: 'Not Closed' },
}

export const DEFAULT_RESULT_STYLE = { bg: 'var(--am-bg4)', color: 'var(--am-muted)', label: 'Unknown' }

const CANONICAL_OUTCOMES = new Set<CallOutcome>(['closed', 'not_closed'])

const LEGACY_OUTCOME_MAP: Record<string, CallOutcome> = {
  // Legacy values from before the 022 ENUM migration, and pre-105 (partial/no_outcome)
  'partial':              'closed',
  'follow_up':            'closed',
  'follow-up':            'closed',
  'no_outcome':           'not_closed',
  'objection_unresolved': 'not_closed',
  'no_decision':          'not_closed',
  'no-close':             'not_closed',
  'no_close':             'not_closed',
}

/** Normalise legacy/inconsistent outcome strings to canonical CallOutcome.
 *  Returns null for unknown values (caller decides fallback).
 */
export function normaliseOutcome(raw: string): CallOutcome | null {
  if (CANONICAL_OUTCOMES.has(raw as CallOutcome)) return raw as CallOutcome
  return LEGACY_OUTCOME_MAP[raw] ?? null
}

// ── Lead source display labels ────────────────────────────────────────────────
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  facebook: 'Facebook',
  google:   'Google',
  organic:  'Organic',
  referral: 'Referral',
  other:    'Other',
}

export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'google',   label: 'Google' },
  { value: 'organic',  label: 'Organic' },
  { value: 'referral', label: 'Referral' },
  { value: 'other',    label: 'Other' },
]

