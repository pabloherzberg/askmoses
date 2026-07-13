import { type NextRequest } from 'next/server'
import { generateText } from 'ai'
// Provider/chave do provider ATIVO (getActiveLlmModel) — geração de critérios
// segue o provider global, igual à geração de script. Ver lib/llm-provider.ts.
import { getActiveLlmModel } from '@/lib/llm-provider'
import { getSession, getOrgId, requireOwnerWrite, unauthorized } from '@/lib/auth'
import { recordLlmUsage } from '@/lib/services/llm-usage'

const SYSTEM_PROMPT = `You are a sales-coaching rubric designer for a dog training business. Given a sales script (its description and its sections), produce a concise list of concrete, observable scoring criteria a coach can use to evaluate a rep's call against that script.

Respond ONLY with a valid JSON object — no markdown, no prose outside the JSON — using this exact shape:
{
  "criteria": [
    { "name": "string — short criterion name (2–4 words)", "description": "string — one observable, checkable behavior the rep should demonstrate on the call" }
  ]
}

## Rules
- Produce 5–8 criteria, each grounded in something concrete in the provided script/sections — do not invent product details absent from the material.
- "name" is a short label; "description" is a single, objectively checkable behavior a coach can mark yes/no while listening — not a vague adjective.
- Cover the script end-to-end: discovery, problem agitation, offer presentation, objection handling, and close/next steps.
- Keep each criterion distinct — no two criteria should measure the same behavior.`

function buildUserPrompt(
  description: string,
  sections: Array<{ name?: string; instructions?: string; tips?: string }>,
): string {
  const parts: string[] = []

  if (description) parts.push(`## Script description\n${description}`)

  if (sections.length > 0) {
    parts.push('## Script sections')
    sections.forEach((s, i) => {
      parts.push(
        `### ${i + 1}. ${s.name ?? ''}\n${s.instructions ?? ''}${s.tips ? `\nTip: ${s.tips}` : ''}`,
      )
    })
  }

  parts.push(
    '\n## Task\nDerive the scoring criteria for this script following the rules above. Base each criterion on the specific tactics, questions, and objections present in the material.',
  )

  return parts.join('\n\n')
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const body = (await request.json()) as {
    scriptDescription?: string
    scriptSections?: Array<{ name?: string; instructions?: string; tips?: string }>
  }
  const description = body.scriptDescription ?? ''
  const sections = body.scriptSections ?? []

  if (!description && sections.length === 0) {
    return Response.json(
      { error: 'Provide a script description or at least one section.' },
      { status: 400 },
    )
  }

  const { model, provider, modelId } = await getActiveLlmModel('gpt-4o-mini')
  const { text, usage } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(description, sections),
  })

  // Telemetria de custo p/ COGS (best-effort).
  void recordLlmUsage({
    orgId: await getOrgId(),
    surface: 'criteria_generation',
    provider,
    model: modelId,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  })

  // Strip potential markdown fences before parsing.
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const result = JSON.parse(cleaned)

  return Response.json(result)
}
