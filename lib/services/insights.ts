import type { Insight } from '@/lib/types'
import { getCalls } from '@/lib/services/calls'
import { getGeminiModel } from '@/lib/gemini'

// const IS_DEV = process.env.NODE_ENV === 'development'

export async function getInsights(): Promise<Insight[]> {
  // if (IS_DEV) {
  //   const { insights } = await import('@/lib/mock-data')
  //   return insights
  // }

  const { dbGetInsights } = await import('@/lib/db/insights')
  return dbGetInsights()
}

export async function generateInsights(scriptId?: string) {
  // ── 1. Fetch recent calls from Supabase ──────────────────────────────────
  const calls = await getCalls({ limit: 50 })

  const closedCalls = calls.filter((c) => c.result === 'closed')
  const notClosedCalls = calls.filter((c) => c.result === 'no_decision' || c.result === 'objection_unresolved')
  const partialCalls = calls.filter((c) => c.result === 'follow_up')
  const closeRate = calls.length > 0 ? Math.round((closedCalls.length / calls.length) * 100) : 0

  const metrics = {
    total: calls.length,
    closed: closedCalls.length,
    notClosed: notClosedCalls.length,
    partial: partialCalls.length,
    closeRate,
  }

  // ── 2. Build transcript summaries for Gemini ─────────────────────────────
  const callSummaries = calls
    .filter((c) => c.transcript)
    .slice(0, 20)
    .map((c, i) =>
      `Call ${i + 1} [${c.result}] — Trainer: ${c.trainerName}, Score: ${c.score}/100\nTranscript excerpt: ${c.transcript?.slice(0, 500) ?? ''}`
    )
    .join('\n\n---\n\n')

  // ── 3. Call Gemini ────────────────────────────────────────────────────────
  const prompt = `
You are an expert sales coach analysing a batch of dog training sales calls.
You have ${calls.length} calls: ${closedCalls.length} closed, ${partialCalls.length} follow-up, ${notClosedCalls.length} not closed.
Close rate: ${closeRate}%.
${scriptId ? `Script ID being analysed: ${scriptId}` : ''}

${callSummaries ? `## Call data:\n${callSummaries}` : 'No transcripts available — generate insights based on the outcome distribution.'}

Analyse the patterns across these calls and return ONLY valid JSON (no markdown) with this exact structure:
{
  "successPatterns": ["<pattern observed in closed calls>", ...],
  "failurePatterns": ["<pattern observed in failed calls>", ...],
  "partialPatterns": ["<pattern observed in follow-up calls>", ...],
  "keyDifferences": ["<what separates closers from non-closers>", ...],
  "dos": ["<actionable do>", ...],
  "donts": ["<actionable don't>", ...],
  "commonObjections": [
    {
      "objection": "<objection text>",
      "frequency": "<Very Common|Common|Occasional>",
      "bestResponse": "<best way to handle it>",
      "worstResponse": "<worst way to handle it>"
    }
  ],
  "preCallChecklist": ["<checklist item>", ...],
  "suggestedScript": "<optimized script outline based on what worked, with numbered sections>"
}

Each array should have 4–8 items. Be specific and actionable — reference actual patterns from the calls when transcripts are available.
`.trim()

  const model = getGeminiModel()
  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch ? jsonMatch[0] : cleaned

  let parsed: {
    successPatterns: string[]
    failurePatterns: string[]
    partialPatterns: string[]
    keyDifferences: string[]
    dos: string[]
    donts: string[]
    commonObjections: { objection: string; frequency: string; bestResponse: string; worstResponse: string }[]
    preCallChecklist: string[]
    suggestedScript: string
  }

  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    console.error('[insights] Raw AI response:', text)
    throw new Error('Failed to parse AI response')
  }

  // ── 4. Fetch trainer list to include in response (used by send-insights) ─
  const trainers = [...new Set(calls.map((c) => c.trainerName))]
    .map((name) => ({ name, email: '' }))

  return {
    metrics,
    ...parsed,
    trainers,
  }
}
