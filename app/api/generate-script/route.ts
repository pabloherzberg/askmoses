import { type NextRequest } from 'next/server'
import { generateText } from 'ai'
import { getOpenAIModel } from '@/lib/openai'
import { getSession, getOrgId, requireOwnerWrite, unauthorized } from '@/lib/auth'
import { getRubricConfig } from '@/lib/services/rubric'
import { recordLlmUsage } from '@/lib/services/llm-usage'

const SYSTEM_PROMPT = `You are a sales script architect. Analyze the provided call transcripts and/or text and generate a structured sales script.

Respond ONLY with a valid JSON object — no markdown, no explanation outside the JSON. Use this exact shape:
{
  "name": "string — concise script name",
  "description": "string — one-sentence description",
  "sections": [
    {
      "name": "Discovery",
      "instructions": "string",
      "tips": "string",
      "weight": number (integer 1–100),
      "critical": boolean
    },
    {
      "name": "Problem Agitation",
      "instructions": "string",
      "tips": "string",
      "weight": number,
      "critical": boolean
    },
    {
      "name": "Offer Presentation",
      "instructions": "string",
      "tips": "string",
      "weight": number,
      "critical": boolean
    },
    {
      "name": "Objection Handling",
      "instructions": "string",
      "tips": "string",
      "weight": number,
      "critical": boolean
    },
    {
      "name": "Close & Next Steps",
      "instructions": "string",
      "tips": "string",
      "weight": number,
      "critical": boolean
    }
  ],
  "full_script": "string — complete script text with all sections combined",
  "explanation": "string — why this script structure works based on the provided material"
}

Rules:
- The sections array must contain EXACTLY these 5 sections in this exact order, with these exact names: Discovery, Problem Agitation, Offer Presentation, Objection Handling, Close & Next Steps. Do not add, remove, or rename any section.
- weight values must sum to exactly 100 across all 5 sections.
- Mark critical: true for sections where failure is eliminatory (typically Discovery, Problem Agitation, Objection Handling).
- Fill instructions and tips based on the provided material — make them specific and actionable.`

function buildUserPrompt(transcripts: string[], textInput: string | null): string {
  const parts: string[] = []

  if (transcripts.length > 0) {
    parts.push(`## Call Transcripts (${transcripts.length} provided)\n`)
    transcripts.forEach((t, i) => {
      parts.push(`### Transcript ${i + 1}\n${t}`)
    })
  }

  if (textInput) {
    parts.push(`## Additional Text / Existing Script\n${textInput}`)
  }

  parts.push(`\n## Task\nBased on the material above, generate a structured sales script using exactly the 5 fixed sections (Discovery, Problem Agitation, Offer Presentation, Objection Handling, Close & Next Steps) with specific instructions and tips for each, plus a complete full_script text. Focus on what made the calls effective.`)

  return parts.join('\n\n')
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const body = await request.json() as { transcripts?: string[]; textInput?: string | null }
  const transcripts = body.transcripts ?? []
  const textInput = body.textInput ?? null

  if (transcripts.length === 0 && !textInput) {
    return Response.json({ error: 'Provide at least one transcript or text input.' }, { status: 400 })
  }

  const { text, usage } = await generateText({
    model: getOpenAIModel('gpt-4o-mini'),
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(transcripts, textInput),
  })

  // Telemetria de custo p/ COGS (best-effort).
  void recordLlmUsage({
    orgId: await getOrgId(),
    surface: 'script_generation',
    model: 'gpt-4o-mini',
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  })

  // Strip potential markdown fences before parsing
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const result = JSON.parse(cleaned)

  return Response.json(result)
}
