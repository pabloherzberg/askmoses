import { type NextRequest } from 'next/server'
import { generateText } from 'ai'
import { getOpenAIModel } from '@/lib/openai'
import { getSession, getOrgId, requireOwnerWrite, unauthorized } from '@/lib/auth'
import { getRubricConfig } from '@/lib/services/rubric'
import { recordLlmUsage } from '@/lib/services/llm-usage'

const SYSTEM_PROMPT = `You are a sales script architect for a dog training business. Analyze the provided call transcripts and/or text and reorganize/rewrite that material into a structured sales script split across exactly 5 fixed sections, in the exact order and with the exact meaning defined below.

Respond ONLY with a valid JSON object — no markdown, no explanation outside the JSON. Use this exact shape:
{
  "name": "string — concise script name",
  "description": "string — one-sentence description",
  "sections": [
    { "name": "Discovery", "instructions": "string", "tips": "string", "weight": number (integer 1–100), "critical": boolean },
    { "name": "Problem Agitation", "instructions": "string", "tips": "string", "weight": number, "critical": boolean },
    { "name": "Offer Presentation", "instructions": "string", "tips": "string", "weight": number, "critical": boolean },
    { "name": "Objection Handling", "instructions": "string", "tips": "string", "weight": number, "critical": boolean },
    { "name": "Close & Next Steps", "instructions": "string", "tips": "string", "weight": number, "critical": boolean }
  ],
  "full_script": "string — complete script text with all sections combined, in order, each prefixed with its section name as a heading",
  "explanation": "string — why this script structure works based on the provided material"
}

## What belongs in each section (use these definitions to classify every piece of the source material — do not invent content for a section if the source has nothing relevant; instead write a best-practice fallback line clearly grounded in the same context)

1. **Discovery** — Everything from first contact through fact-finding: opening the call (greeting/voicemail/callback framing, whichever scenario applies), rapport-building, and questions about the dog's breed/age, the specific behavior problem, how long it's been happening, what the owner has already tried, and the impact on daily life. If the source has different fact-finding question branches for different problem types (e.g. potty training vs. aggression vs. leash pulling), keep that conditional structure intact and summarize it as "ask the branch matching the reported issue" rather than flattening it into one generic list. Goal: get the owner talking before pitching anything.
2. **Problem Agitation** — The bridge between fact-finding and the pitch: reflecting back / playing back what the owner shared ("it sounds like your biggest goal is...") and amplifying the pain so the owner feels the cost of inaction (stress, safety risk, damaged relationship with the dog, time wasted). No pricing or program details here — purely emotional/consequence framing built on what Discovery revealed.
3. **Offer Presentation** — Introducing the training program/package as the specific solution to the problem just agitated. Program structure, what's included, timeline/duration, added-value items (equipment, support, alumni/community access, etc.), and how it maps to the dog's specific issue. If multiple program tiers/durations and prices exist in the source, preserve them as a tier list rather than collapsing to one price. Price should be anchored to value first.
4. **Objection Handling** — Responses to pushback: price/cost concerns, dog's age or breed doubts, timing/schedule concerns, needing to consult a partner or other trainers, "let me think about it," skepticism about results/guarantees. Each objection should be named and paired with the rebuttal approach, including any follow-up questions the source uses to re-engage the prospect before answering (not just a flat statement).
5. **Close & Next Steps** — The direct ask to book/enroll (e.g. scheduling a next appointment/session/evaluation), and confirming concrete next steps (date, deposit, what to bring, intake call, etc.). Must contain an explicit booking ask, not just a summary.

General behavioral/coaching guidance in the source that isn't tied to one moment in the call (tone rules, call-length targets, listening ratios, mindset reminders) is not its own section — fold each such rule into the "tips" of whichever section it most affects (e.g. a listening ratio or tone rule strengthens the Discovery tip).

## Rules
- The sections array must contain EXACTLY these 5 sections in this exact order, with these exact names: Discovery, Problem Agitation, Offer Presentation, Objection Handling, Close & Next Steps. Do not add, remove, or rename any section.
- Before writing, mentally split the source material (transcripts and/or pasted text) line-by-line or idea-by-idea and assign each idea to the section it matches by definition above, even if the source presents them out of order, split across multiple call-opening variants, or mixed together. Do not just paste a chunk of source text into whichever section it originally appeared near.
- If the source is a full script rather than a transcript, condense and rewrite it into each section's instructions rather than copying it verbatim — preserve the specific tactics, branches, tiers, and phrasing, but keep each section concise enough to scan during a live call.
- Each section's "instructions" must describe what the trainer should DO/SAY in that part of the call, written as concrete guidance or example lines — not a generic label repeated across sections.
- "tips" is one short, section-specific coaching tip — it must be different in substance for each section (e.g. a Discovery tip is about questioning technique or listening ratio, a Close tip is about assumptive language), never a generic reused sentence.
- weight values must sum to exactly 100 across all 5 sections, reflecting how much each section matters based on the material (e.g. weight Objection Handling and Close higher if the source shows those are where deals are won/lost).
- Mark critical: true for sections where failure is eliminatory (typically Discovery, Problem Agitation, Objection Handling) — set this based on the actual material, not by default.
- Fill instructions and tips based on the provided material — make them specific and actionable, referencing details actually present in the source (dog names, specific objections raised, specific phrasing, pricing tiers) whenever available.
- "full_script" must contain all 5 sections in order, each clearly headed by its section name, forming one coherent script a trainer could read top-to-bottom on a live call.`

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

  parts.push(`\n## Task\nRead the material above carefully and identify which parts belong to Discovery, Problem Agitation, Offer Presentation, Objection Handling, and Close & Next Steps, using the section definitions from the system prompt. Do not force unrelated content into a section just because of where it appeared in the source — reclassify by meaning. If the source is thin or missing content for a section, write a realistic best-practice line for a dog training sales call that stays consistent with the tone, dog, and problem mentioned elsewhere in the material, rather than a generic filler. Then produce the 5 fixed sections with specific instructions and tips for each, plus a complete full_script text. Focus on what made the calls (or pasted script) effective, and on fixing what's weak.`)

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
