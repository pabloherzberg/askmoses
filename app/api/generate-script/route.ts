import { type NextRequest } from 'next/server'
import { generateText } from 'ai'
import { getOpenAIModel } from '@/lib/openai'
import { getSession, requireOwnerWrite, unauthorized } from '@/lib/auth'
import { getRubricConfig } from '@/lib/services/rubric'

const SYSTEM_PROMPT = `You are a sales script architect. Analyze the provided call transcripts and/or text and generate a structured sales script.

Respond ONLY with a valid JSON object — no markdown, no explanation outside the JSON. Use this exact shape:
{
  "name": "string — concise script name",
  "description": "string — one-sentence description",
  "sections": [
    {
      "name": "string",
      "instructions": "string",
      "tips": "string",
      "weight": number (integer 1–100; all sections must sum to exactly 100),
      "critical": boolean (true if a low score here is eliminatory — e.g. Discovery, Problem Agitation)
    }
  ],
  "full_script": "string — complete script text with all sections combined",
  "criteria": [
    { "name": "string", "description": "string — what the evaluator should look for" }
  ],
  "explanation": "string — why this script structure works based on the provided material"
}

Rules for weight and critical:
- weight values must sum to exactly 100 across all sections.
- Mark critical: true for sections where failure is eliminatory (e.g. Discovery, Problem Agitation, Objection Handling).
- Distribute weights proportionally to each section's impact on closing the deal.`

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

  parts.push(`\n## Task\nBased on the material above, generate a structured sales script with 5–7 sections, a complete full_script text, and 5–7 evaluation criteria. Focus on what made the calls effective.`)

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

  const { text } = await generateText({
    model: getOpenAIModel('gpt-4o-mini'),
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(transcripts, textInput),
  })

  // Strip potential markdown fences before parsing
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const result = JSON.parse(cleaned)

  return Response.json(result)
}
