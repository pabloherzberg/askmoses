import type { Locale } from '@/i18n/routing'
import type { Call, BestCall, Insight } from '@/lib/types'
import type { CoachingRec, BehavioralDimension } from '@/lib/mock-data'
import { translateStrings } from '@/lib/i18n/translate'

/**
 * Translate coaching-relevant text fields of a single Call.
 * Data fields (trainerName, prospect, date, duration, scores, transcript) are
 * untouched. Section names are NOT translated — they're owner-defined script
 * step names (e.g., "Opening", "Discovery") and stay verbatim.
 */
export async function translateCall(call: Call, locale: Locale): Promise<Call> {
  if (locale === 'en') return call

  // Flatten all translatable strings into one batch so we only pay for one LLM call.
  const strengthsCount = call.strengths.length
  const improvementsCount = call.improvements.length
  const sectionsCount = call.sections?.length ?? 0
  const batch = [
    call.feedback,
    ...call.strengths,
    ...call.improvements,
    ...(call.sections ?? []).map((s) => s.feedback),
  ]
  const translated = await translateStrings(batch, locale)

  let cursor = 0
  const feedback = translated[cursor++]
  const strengths = translated.slice(cursor, cursor + strengthsCount); cursor += strengthsCount
  const improvements = translated.slice(cursor, cursor + improvementsCount); cursor += improvementsCount
  const sections = call.sections
    ? call.sections.map((s, i) => ({ ...s, feedback: translated[cursor + i] ?? s.feedback }))
    : call.sections
  cursor += sectionsCount

  return { ...call, feedback, strengths, improvements, sections }
}

/**
 * Translate a list of calls in a single batched LLM call.
 * Preserves order and the non-translatable fields of each call (incl. section
 * names — only feedback text gets translated per section).
 */
export async function translateCalls(calls: Call[], locale: Locale): Promise<Call[]> {
  if (locale === 'en' || calls.length === 0) return calls

  const batch: string[] = []
  const shapes: { strengths: number; improvements: number; sections: number }[] = []
  for (const c of calls) {
    batch.push(c.feedback)
    batch.push(...c.strengths)
    batch.push(...c.improvements)
    batch.push(...(c.sections ?? []).map((s) => s.feedback))
    shapes.push({
      strengths: c.strengths.length,
      improvements: c.improvements.length,
      sections: c.sections?.length ?? 0,
    })
  }

  const translated = await translateStrings(batch, locale)

  let cursor = 0
  return calls.map((c, i) => {
    const { strengths: sLen, improvements: iLen, sections: secLen } = shapes[i]
    const feedback = translated[cursor++]
    const strengths = translated.slice(cursor, cursor + sLen); cursor += sLen
    const improvements = translated.slice(cursor, cursor + iLen); cursor += iLen
    const sections = c.sections
      ? c.sections.map((s, idx) => ({ ...s, feedback: translated[cursor + idx] ?? s.feedback }))
      : c.sections
    cursor += secLen
    return { ...c, feedback, strengths, improvements, sections }
  })
}

/**
 * Insights payload returned by POST /api/insights.
 * Shape mirrors `InsightsResult` declared inline in the page component.
 */
export interface InsightsPayload {
  metrics: {
    total: number
    closed: number
    notClosed: number
    partial: number
    closeRate: number
  }
  successPatterns: string[]
  failurePatterns: string[]
  partialPatterns: string[]
  dos: string[]
  donts: string[]
  commonObjections: {
    objection: string
    frequency: string
    bestResponse: string
    worstResponse: string
  }[]
  preCallChecklist: string[]
  suggestedScript: string
  keyDifferences: string[]
  trainers: { name: string; email: string }[]
}

export async function translateInsights(
  insights: InsightsPayload,
  locale: Locale,
): Promise<InsightsPayload> {
  if (locale === 'en') return insights

  // `frequency` values ("Very Common" / "Common" / "Rare") are translated on the
  // client via static `Shared.outcomes`-style keys — skip here.
  const batch: string[] = [
    ...insights.successPatterns,
    ...insights.failurePatterns,
    ...insights.partialPatterns,
    ...insights.dos,
    ...insights.donts,
    ...insights.commonObjections.flatMap((o) => [o.objection, o.bestResponse, o.worstResponse]),
    ...insights.preCallChecklist,
    ...insights.keyDifferences,
    insights.suggestedScript,
  ]

  const translated = await translateStrings(batch, locale)

  let cursor = 0
  const slice = (n: number) => {
    const out = translated.slice(cursor, cursor + n)
    cursor += n
    return out
  }

  const successPatterns = slice(insights.successPatterns.length)
  const failurePatterns = slice(insights.failurePatterns.length)
  const partialPatterns = slice(insights.partialPatterns.length)
  const dos = slice(insights.dos.length)
  const donts = slice(insights.donts.length)

  const objections = insights.commonObjections.map((o) => {
    const objection = translated[cursor++]
    const bestResponse = translated[cursor++]
    const worstResponse = translated[cursor++]
    return { ...o, objection, bestResponse, worstResponse }
  })

  const preCallChecklist = slice(insights.preCallChecklist.length)
  const keyDifferences = slice(insights.keyDifferences.length)
  const suggestedScript = translated[cursor++]

  return {
    ...insights,
    successPatterns,
    failurePatterns,
    partialPatterns,
    dos,
    donts,
    commonObjections: objections,
    preCallChecklist,
    keyDifferences,
    suggestedScript,
  }
}

/** Translate a single BestCall (Team Command Center: best/worst call cards). */
export async function translateBestCalls(
  calls: BestCall[],
  locale: Locale,
): Promise<BestCall[]> {
  if (locale === 'en' || calls.length === 0) return calls
  const batch = calls.map((c) => c.analysis)
  const translated = await translateStrings(batch, locale)
  return calls.map((c, i) => ({ ...c, analysis: translated[i] ?? c.analysis }))
}

/** Translate the list of coaching recommendations for one trainer. */
export async function translateCoachingRecs(
  recs: CoachingRec[],
  locale: Locale,
): Promise<CoachingRec[]> {
  if (locale === 'en' || recs.length === 0) return recs
  const batch = recs.flatMap((r) => [r.title, r.text, r.cta])
  const translated = await translateStrings(batch, locale)
  return recs.map((r, i) => ({
    ...r,
    title: translated[i * 3] ?? r.title,
    text: translated[i * 3 + 1] ?? r.text,
    cta: translated[i * 3 + 2] ?? r.cta,
  }))
}

/** Translate the user-facing fields of the AI insight cards (title, summary,
 *  action, tag). Tag is included because the server emits English strings like
 *  "Team pattern" / "ROI signal" — not i18n keys. One batched LLM call. */
export async function translateInsightCards(
  insights: Insight[],
  locale: Locale,
): Promise<Insight[]> {
  if (locale === 'en' || insights.length === 0) return insights
  const batch = insights.flatMap((i) => [i.title, i.summary, i.action, i.tag])
  const translated = await translateStrings(batch, locale)
  return insights.map((i, idx) => ({
    ...i,
    title:   translated[idx * 4]     ?? i.title,
    summary: translated[idx * 4 + 1] ?? i.summary,
    action:  translated[idx * 4 + 2] ?? i.action,
    tag:     translated[idx * 4 + 3] ?? i.tag,
  }))
}

/** Translate the `dimension` label of each behavioral entry (numbers untouched). */
export async function translateBehavioralDimensions(
  dims: BehavioralDimension[],
  locale: Locale,
): Promise<BehavioralDimension[]> {
  if (locale === 'en' || dims.length === 0) return dims
  const batch = dims.map((d) => d.dimension)
  const translated = await translateStrings(batch, locale)
  return dims.map((d, i) => ({ ...d, dimension: translated[i] ?? d.dimension }))
}

// ─── Consolidated coaching-bundle translator ───────────────────────────────

export interface CoachingBundle {
  bestCalls: Record<string, BestCall[]>
  worstCalls: Record<string, BestCall[]>
  trainerBehavioral: Record<string, BehavioralDimension[]>
  coachingRecs: Record<string, CoachingRec[]>
}

/**
 * Translate the entire `/api/coaching` payload in ONE LLM call.
 *
 * Flattens every translatable string across all trainers (best analyses,
 * worst analyses, behavioral dimensions, coaching rec title/text/cta) into a
 * single array, translates once, then reconstructs the original nested shape.
 *
 * This is strictly faster than N parallel calls (one network round-trip, one
 * rate-limit hit) and dramatically reduces quota consumption.
 */
export async function translateCoachingBundle(
  bundle: CoachingBundle,
  locale: Locale,
): Promise<CoachingBundle> {
  if (locale === 'en') return bundle

  const strings: string[] = []

  // Phase 1 — flatten. Order matters: we walk the same structure on the way back.
  // For best/worst calls we translate both `analysis` AND `result` (free-form
  // labels like "Closed", "No Close" — not the canonical CallOutcome enum).
  for (const calls of Object.values(bundle.bestCalls)) {
    for (const c of calls) {
      strings.push(c.result)
      strings.push(c.analysis)
    }
  }
  for (const calls of Object.values(bundle.worstCalls)) {
    for (const c of calls) {
      strings.push(c.result)
      strings.push(c.analysis)
    }
  }
  for (const dims of Object.values(bundle.trainerBehavioral)) {
    for (const d of dims) strings.push(d.dimension)
  }
  for (const recs of Object.values(bundle.coachingRecs)) {
    for (const r of recs) {
      strings.push(r.title)
      strings.push(r.text)
      strings.push(r.cta)
    }
  }

  if (strings.length === 0) return bundle

  // Phase 2 — single batched LLM call (with model-chain failover + cache).
  const translated = await translateStrings(strings, locale)

  // Phase 3 — rebuild the bundle by re-walking the structure in the same order.
  let cursor = 0
  const bestCalls: Record<string, BestCall[]> = {}
  for (const [key, calls] of Object.entries(bundle.bestCalls)) {
    bestCalls[key] = calls.map((c) => ({
      ...c,
      result: translated[cursor++] ?? c.result,
      analysis: translated[cursor++] ?? c.analysis,
    }))
  }
  const worstCalls: Record<string, BestCall[]> = {}
  for (const [key, calls] of Object.entries(bundle.worstCalls)) {
    worstCalls[key] = calls.map((c) => ({
      ...c,
      result: translated[cursor++] ?? c.result,
      analysis: translated[cursor++] ?? c.analysis,
    }))
  }
  const trainerBehavioral: Record<string, BehavioralDimension[]> = {}
  for (const [key, dims] of Object.entries(bundle.trainerBehavioral)) {
    trainerBehavioral[key] = dims.map((d) => ({ ...d, dimension: translated[cursor++] ?? d.dimension }))
  }
  const coachingRecs: Record<string, CoachingRec[]> = {}
  for (const [key, recs] of Object.entries(bundle.coachingRecs)) {
    coachingRecs[key] = recs.map((r) => ({
      ...r,
      title: translated[cursor++] ?? r.title,
      text: translated[cursor++] ?? r.text,
      cta: translated[cursor++] ?? r.cta,
    }))
  }

  return { bestCalls, worstCalls, trainerBehavioral, coachingRecs }
}
