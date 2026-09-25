// Single source of truth for score scale conversion and thresholds.
//
// Internal canonical scale: 0–100 (LLM-native, what the DB stores in
// `calls.sections[].score` and — after migration 038 — `calls.overall_score`).
// User-facing display: 0–5 with one decimal ("4.6"), via toDisplay5().
//
// No other file in the codebase should perform `/ 20`, `* 20`, or inline
// thresholds like `>= 4.25` / `>= 85` against a score. Add new helpers here
// instead.

export type ScoreLevel = 'high' | 'mid' | 'low'

export const PERFECT_CALL_THRESHOLD = 95

export function scoreLevel(s100: number): ScoreLevel {
  if (s100 >= 85) return 'high'
  if (s100 >= 70) return 'mid'
  return 'low'
}

export function scoreColorVar(s100: number): string {
  const lvl = scoreLevel(s100)
  if (lvl === 'high') return 'var(--am-green)'
  if (lvl === 'mid') return 'var(--am-amber)'
  return 'var(--am-red)'
}

export function scorePalette(s100: number): { fg: string; bg: string } {
  const lvl = scoreLevel(s100)
  if (lvl === 'high') return { fg: 'var(--am-green)', bg: 'var(--am-green-bg)' }
  if (lvl === 'mid') return { fg: 'var(--am-amber)', bg: 'var(--am-amber-bg)' }
  return { fg: 'var(--am-red)', bg: 'var(--am-red-bg)' }
}

export function toNumber5(s100: number): number {
  return s100 / 20
}

// Section scores from `calls.sections[].score` come in a mixed scale: the AI
// writes 0–100 (canonical, post migration 038), but rows seeded/backfilled
// before that still carry 0–5. `raw > 5` disambiguates which scale a given
// value is already in and normalizes to 0–100. Only correct while every
// value ≤ 5 in the wild is legitimately a pre-038 row — a real 0–100 score
// of e.g. 3 (a very bad call) would be misread as "3 on the old 0–5 scale"
// and inflated to 60. See checklist §5.2 — dormant while all such values are
// exactly 0, but will misfire the day a real low score appears in this range.
export function normalizeSectionScore(raw: number): number {
  return raw > 5 ? raw : raw * 20
}

export function toDisplay5(s100: number): string {
  return (s100 / 20).toFixed(1)
}

export function toDisplay5Suffixed(s100: number): string {
  return `${toDisplay5(s100)}/5`
}

export function toDisplay5Delta(delta100: number): string {
  const v = delta100 / 20
  return v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)
}

export function toBarWidth(s100: number): number {
  return Math.max(0, Math.min(100, s100))
}

export function toCorrelationLevel(s100: number): 'High' | 'Med' | 'Low' {
  const lvl = scoreLevel(s100)
  if (lvl === 'high') return 'High'
  if (lvl === 'mid') return 'Med'
  return 'Low'
}

// Tier used by CallDetail to pick fallback feedback copy.
// Separate from `scoreLevel` because the copy-tier boundaries are owned
// by mock-data fallbacks (high/mid/low keys in sectionFeedbackFallback).
export function feedbackTier(s100: number): 'high' | 'mid' | 'low' {
  if (s100 >= 80) return 'high'
  if (s100 >= 60) return 'mid'
  return 'low'
}
