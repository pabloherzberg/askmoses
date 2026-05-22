import { type NextRequest } from 'next/server'
import { generateText } from 'ai'
import { getOpenAIModel } from '@/lib/openai'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'
import type { ScriptSection, ScriptCriterion } from '@/lib/db/scripts'

const SYSTEM_PROMPT = `You are an expert sales coach analyzing closed sales calls to improve an existing sales script.

You will receive:
1. The CURRENT script structure (sections, instructions, tips, criteria)
2. A sample of recent call transcripts from this organization

Your task: propose targeted improvements to the existing script based on patterns observed in the calls.

Constraints:
- Keep the same number of sections. Do NOT add or remove sections.
- Do NOT add or remove criteria.
- Only improve: instructions text, tips text, and criteria descriptions.
- Weights and critical flags must remain EXACTLY the same as in the current script.
- Focus on what is working vs. what is failing in the transcripts.

Respond ONLY with a valid JSON object — no markdown, no explanation outside JSON:
{
  "name": "string — same or slightly updated name",
  "description": "string — updated one-sentence description",
  "sections": [
    {
      "name": "string — keep original name",
      "instructions": "string — improved instructions",
      "tips": "string — improved tip",
      "weight": number — UNCHANGED from current,
      "critical": boolean — UNCHANGED from current
    }
  ],
  "full_script": "string — regenerated full script text combining all sections",
  "criteria": [
    { "name": "string — keep original name", "description": "string — improved description" }
  ],
  "explanation": "string — 2-3 sentences explaining what changed and why, based on call patterns"
}`

function buildImprovePrompt(
  currentScript: { name: string; description: string | null; sections: ScriptSection[]; criteria: ScriptCriterion[] },
  recentCalls: Array<{ transcript: string; score?: number | null }>,
): string {
  const parts: string[] = []

  parts.push(`## Current Script: "${currentScript.name}"`)
  parts.push(`Description: ${currentScript.description ?? '(none)'}`)
  parts.push(`\n### Sections`)
  currentScript.sections.forEach((s, i) => {
    parts.push(`${i + 1}. **${s.name}** (weight: ${s.weight ?? '?'}%, critical: ${s.critical ?? false})
Instructions: ${s.instructions}
Tips: ${s.tips}`)
  })

  parts.push(`\n### Evaluation Criteria`)
  currentScript.criteria.forEach((c, i) => {
    parts.push(`${i + 1}. ${c.name}: ${c.description}`)
  })

  if (recentCalls.length > 0) {
    parts.push(`\n## Recent Call Transcripts (${recentCalls.length} calls)`)
    recentCalls.forEach((call, i) => {
      const scoreLabel = call.score != null ? ` — Score: ${call.score}/5` : ''
      parts.push(`### Call ${i + 1}${scoreLabel}\n${call.transcript}`)
    })
  }

  parts.push(`\n## Task
Based on the transcripts above, propose improvements to the current script.
Remember: keep the same sections and criteria names. Only improve the text content.
Weights and critical flags must be identical to the current script.`)

  return parts.join('\n\n')
}

// POST /api/admin/scripts/improve
// Body: { scriptId: string; orgId: string }
// Returns: improved script shape (same as /api/generate-script) + explanation
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  const body = await request.json() as { scriptId?: string; orgId?: string | null }
  const { scriptId } = body

  if (!scriptId) {
    return Response.json(
      { data: null, error: { message: 'scriptId is required', code: 400 } },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // Fetch current script
  const { data: scriptData, error: scriptError } = await admin
    .from('scripts')
    .select('id, name, description, sections, criteria, rubric_id')
    .eq('id', scriptId)
    .single()

  if (scriptError || !scriptData) {
    return Response.json(
      { data: null, error: { message: 'Script not found', code: 404 } },
      { status: 404 },
    )
  }

  // Fetch up to 5 recent calls globally (any org) — transcripts used for context only
  const { data: callsData } = await admin
    .from('calls')
    .select('transcript, overall_score')
    .not('transcript', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5)

  const recentCalls = (callsData ?? [])
    .filter((c: { transcript: string | null; overall_score: number | null }) => c.transcript)
    .map((c: { transcript: string | null; overall_score: number | null }) => ({
      transcript: c.transcript as string,
      score: c.overall_score,
    }))

  const currentScript = scriptData as {
    id: string
    name: string
    description: string | null
    sections: ScriptSection[]
    criteria: ScriptCriterion[]
    rubric_id: string
  }

  const { text } = await generateText({
    model: getOpenAIModel('gpt-4o-mini'),
    system: SYSTEM_PROMPT,
    prompt: buildImprovePrompt(currentScript, recentCalls),
  })

  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const result = JSON.parse(cleaned)

  return ok({
    ...result,
    sourceScriptId: scriptId,
    callsAnalyzed: recentCalls.length,
  })
}
