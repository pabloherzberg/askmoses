import { type NextRequest } from 'next/server'
import { generateText } from 'ai'
import { getOpenAIModel } from '@/lib/openai'
import { getActiveOrgContext, ok, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ScriptSection } from '@/lib/db/scripts'
import type { ScriptIntelligenceResult } from '@/lib/mocks/data/script-intelligence'

// ── System prompt — only asks for health/scores/rationale, NOT suggestions content ──

const SYSTEM_PROMPT = `You are a senior sales coach specialising in dog training businesses.

You will receive:
1. The CURRENT script (sections with name, instructions, tips)
2. The SUGGESTED script (same sections, improved by admin)
3. Up to 7 recent call transcripts with scores and outcomes

Your task: produce a Script Intelligence report.

Respond ONLY with a valid JSON object — no markdown, no explanation outside JSON:
{
  "totalCalls": number,
  "healthScore": number (0–100, weighted average of section scores based on transcripts),
  "effectivenessLabel": "good" | "roomToImprove" | "poor",
  "revenueLeak": "string — 1 sentence naming the 1-2 weakest sections and estimated monthly impact",
  "sections": [
    {
      "id": "string — slug of section name (lowercase, underscores)",
      "name": "string — exact section name from current script",
      "score": number (0–100 — how well this section is executed in the transcripts),
      "status": "strong" | "weak" | "missing",
      "usageStat": "string — 1 sentence grounded in the transcripts",
      "isMissingQuote": boolean
    }
  ],
  "suggestions": [
    {
      "sectionName": "string — exact section name",
      "rationale": "string — why this section needs improvement, grounded in the call transcripts"
    }
  ],
  "topCloserPhrases": [
    {
      "section": "string",
      "uplift": "string — e.g. +18%",
      "upliftType": "close" | "show",
      "quote": "string — exact phrase from a transcript"
    }
  ]
}

Rules:
- effectivenessLabel: good if healthScore >= 80, roomToImprove if >= 60, poor otherwise
- sections array must match the current script sections order
- isMissingQuote: true only if the section had no execution in the transcripts
- One suggestion per section that differs between current and suggested script
- At least 3 topCloserPhrases extracted from closed/high-scoring calls
- Be specific — cite actual patterns from the transcripts`

function buildPrompt(
  currentScript: { name: string; sections: ScriptSection[] },
  suggestedScript: { name: string; sections: ScriptSection[] },
  calls: Array<{ transcript: string; overall_score: number | null; call_outcome: string | null }>,
): string {
  const parts: string[] = []

  parts.push(`## Current Script: "${currentScript.name}"`)
  currentScript.sections.forEach((s, i) => {
    parts.push(`**${i + 1}. ${s.name}**\nInstructions: ${s.instructions}\nTips: ${s.tips}`)
  })

  parts.push(`\n## Suggested Script: "${suggestedScript.name}"`)
  suggestedScript.sections.forEach((s, i) => {
    parts.push(`**${i + 1}. ${s.name}**\nInstructions: ${s.instructions}`)
  })

  parts.push(`\n## Call Transcripts (${calls.length} calls)`)
  calls.forEach((call, i) => {
    const outcome = call.call_outcome ?? 'unknown'
    const score = call.overall_score != null ? `${call.overall_score}/100` : 'unscored'
    parts.push(`### Call ${i + 1} — Outcome: ${outcome} | Score: ${score}\n${call.transcript}`)
  })

  parts.push(`\n## Task
Score each section of the current script based on how well it is executed in the transcripts.
For each section that differs between current and suggested, write a rationale explaining why the suggested version is better, grounded in what you observed in the calls.
Extract top closer phrases from the transcripts.`)

  return parts.join('\n\n')
}

// POST /api/script-intelligence
// Body: { scriptId?: string, currentScriptId?: string }
//   scriptId = suggested script (pending incoming)
//   currentScriptId = active script of the org
// If only one ID is provided, treats it as the current script (no suggestion comparison).
export async function POST(request: NextRequest) {
  const ctx = await getActiveOrgContext()
  if (!ctx) return unauthorized()
  if (!ctx.activeOrgId) return Response.json(
    { data: null, error: { message: 'No active organization', code: 403 } },
    { status: 403 },
  )

  let scriptId: string | undefined
  let currentScriptId: string | undefined
  try {
    const body = await request.json() as { scriptId?: string; currentScriptId?: string }
    scriptId = body.scriptId
    currentScriptId = body.currentScriptId
  } catch {
    // body optional
  }

  const admin = createAdminClient()

  // Helper — load script by id without org restriction (suggested scripts may come from admin)
  async function loadScript(id: string) {
    const { data } = await admin
      .from('scripts')
      .select('id, name, description, sections')
      .eq('id', id)
      .maybeSingle()
    return data as { id: string; name: string; description: string | null; sections: ScriptSection[] } | null
  }

  // Helper — load active script of the org
  async function loadActiveScript() {
    const { data } = await admin
      .from('scripts')
      .select('id, name, description, sections')
      .eq('org_id', ctx!.activeOrgId!)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data as { id: string; name: string; description: string | null; sections: ScriptSection[] } | null
  }

  // Resolve current and suggested scripts
  const currentScript = currentScriptId
    ? await loadScript(currentScriptId)
    : await loadActiveScript()

  if (!currentScript) {
    return Response.json(
      { data: null, error: { message: 'Current script not found', code: 404 } },
      { status: 404 },
    )
  }

  const suggestedScript = scriptId ? await loadScript(scriptId) : null

  // Load recent calls with truncated transcripts
  const { data: callsRaw } = await admin
    .from('calls')
    .select('transcript, overall_score, call_outcome')
    .eq('org_id', ctx.activeOrgId)
    .not('transcript', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20)

  const calls = (callsRaw ?? [])
    .filter((c: { transcript: string | null }) => c.transcript && c.transcript.length > 100)
    .slice(0, 7)
    .map((c) => ({
      ...c,
      transcript: (c.transcript as string).slice(0, 1500),
    })) as Array<{ transcript: string; overall_score: number | null; call_outcome: string | null }>

  if (calls.length === 0) {
    return Response.json(
      { data: null, error: { message: 'No calls with transcripts found. Upload and analyze some calls first.', code: 422 } },
      { status: 422 },
    )
  }

  // Build prompt and call AI
  const prompt = buildPrompt(
    currentScript,
    suggestedScript ?? currentScript,
    calls,
  )

  let text: string
  try {
    const result = await generateText({
      model: getOpenAIModel('gpt-4o-mini'),
      system: SYSTEM_PROMPT,
      prompt,
      temperature: 0.3,
    })
    text = result.text
  } catch (err) {
    console.error('[script-intelligence] OpenAI call failed:', err)
    return Response.json(
      { data: null, error: { message: 'AI analysis failed. Please try again.', code: 500 } },
      { status: 500 },
    )
  }

  // Parse AI response
  let parsed: {
    totalCalls: number
    healthScore: number
    effectivenessLabel: 'good' | 'roomToImprove' | 'poor'
    revenueLeak: string
    sections: Array<{
      id: string
      name: string
      score: number
      status: 'strong' | 'weak' | 'missing'
      usageStat: string
      isMissingQuote: boolean
    }>
    suggestions: Array<{ sectionName: string; rationale: string }>
    topCloserPhrases: ScriptIntelligenceResult['topCloserPhrases']
  }

  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    parsed = JSON.parse(cleaned)

    if (!parsed.healthScore || !parsed.sections?.length) {
      throw new Error('Invalid response structure')
    }
  } catch (err) {
    console.error('[script-intelligence] JSON parse failed:', err, '\nRaw:', text.slice(0, 500))
    return Response.json(
      { data: null, error: { message: 'AI returned an invalid response. Please try again.', code: 500 } },
      { status: 500 },
    )
  }

  // Build final result — override with real script content, never trust AI for quotes
  const sectionsResult: ScriptIntelligenceResult['sections'] = parsed.sections.map((sec, i) => {
    const byName = currentScript.sections.find(
      (s) => s.name.toLowerCase() === sec.name.toLowerCase()
    )
    const match = byName ?? currentScript.sections[i] ?? null
    return {
      ...sec,
      id: match ? match.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') : sec.id,
      name: match?.name ?? sec.name,
      quote: match?.instructions ?? null,
      isMissingQuote: !match?.instructions,
    }
  })

  // Build suggestions by crossing current vs suggested script sections
  const suggestionsResult: ScriptIntelligenceResult['suggestions'] = []

  if (suggestedScript) {
    for (const sugSec of suggestedScript.sections) {
      const currSec = currentScript.sections.find(
        (s) => s.name.toLowerCase() === sugSec.name.toLowerCase()
      ) ?? currentScript.sections[suggestedScript.sections.indexOf(sugSec)]

      // Only include if instructions actually differ
      if (!currSec || currSec.instructions.trim() === sugSec.instructions.trim()) continue

      const aiSuggestion = parsed.suggestions?.find(
        (s) => s.sectionName.toLowerCase() === sugSec.name.toLowerCase()
      )

      suggestionsResult.push({
        sectionName: sugSec.name,
        action: 'rewrite',
        originalQuote: currSec.instructions,
        suggestedQuote: sugSec.instructions,
        rationale: aiSuggestion?.rationale ?? `This section was updated in the suggested script based on call performance patterns.`,
      })
    }
  }

  const result: ScriptIntelligenceResult = {
    totalCalls: calls.length,
    healthScore: parsed.healthScore,
    effectivenessLabel: parsed.effectivenessLabel,
    revenueLeak: parsed.revenueLeak,
    sections: sectionsResult,
    suggestions: suggestionsResult,
    topCloserPhrases: parsed.topCloserPhrases ?? [],
  }

  return ok(result)
}
