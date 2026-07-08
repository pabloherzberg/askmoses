import { type NextRequest } from 'next/server'
import { generateText } from 'ai'
import { getOpenAIModel } from '@/lib/openai'
import { getSession, getOrgId, requireOwnerWrite, unauthorized } from '@/lib/auth'
import { getRubricConfig } from '@/lib/services/rubric'
import { recordLlmUsage } from '@/lib/services/llm-usage'
import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/script-intelligence/generate-script-prompt'

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
