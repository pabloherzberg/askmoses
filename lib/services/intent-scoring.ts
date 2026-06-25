import { generateText } from 'ai'
import { getOpenAIModel } from '@/lib/openai'
import { computeCostUsd, LLM_TEMPERATURE_PRIMARY } from '@/lib/constants/llm'
import type { IntentBreakdown } from '@/lib/types'

export interface IntentScoringInput {
  transcript: string
  trainerName?: string
  clientName?: string
  weights: {
    financial: number
    urgency: number
    authority: number
    engagement: number
  }
}

export interface IntentScoringResult {
  breakdown: IntentBreakdown
  modelUsed: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export async function scoreIntentFromTranscript(
  input: IntentScoringInput,
): Promise<IntentScoringResult> {
  const prompt = buildIntentPrompt({
    transcript: input.transcript,
    trainerName: input.trainerName ?? 'not provided',
    clientName: input.clientName ?? 'not provided',
    weights: input.weights,
  })

  const model = getOpenAIModel(null)
  const llmResult = await generateText({
    model,
    prompt,
    temperature: LLM_TEMPERATURE_PRIMARY,
  })

  let parsed: IntentBreakdown
  try {
    const json = JSON.parse(llmResult.text)
    parsed = {
      financial: clamp(Math.round(json.financial ?? 5), 0, 10),
      urgency: clamp(Math.round(json.urgency ?? 5), 0, 10),
      authority: clamp(Math.round(json.authority ?? 5), 0, 10),
      engagement: clamp(Math.round(json.engagement ?? 5), 0, 10),
    }
  } catch {
    parsed = { financial: 5, urgency: 5, authority: 5, engagement: 5 }
  }

  const modelUsed = 'gpt-4o-mini'
  const costUsd = computeCostUsd(modelUsed, llmResult.usage?.inputTokens ?? 0, llmResult.usage?.outputTokens ?? 0)

  return {
    breakdown: parsed,
    modelUsed,
    inputTokens: llmResult.usage?.inputTokens ?? 0,
    outputTokens: llmResult.usage?.outputTokens ?? 0,
    costUsd,
  }
}

function buildIntentPrompt(input: {
  transcript: string
  trainerName: string
  clientName: string
  weights: {
    financial: number
    urgency: number
    authority: number
    engagement: number
  }
}): string {
  const totalWeight = Object.values(input.weights).reduce((a, b) => a + b, 0)

  if (totalWeight === 0) {
    throw new Error('buildIntentPrompt: Total weight cannot be 0. All weights must be > 0.')
  }

  const normalizedWeights = Object.entries(input.weights).reduce(
    (acc, [key, value]) => {
      acc[key as keyof typeof input.weights] = value / totalWeight
      return acc
    },
    {} as Record<keyof typeof input.weights, number>,
  )

  return `You are an expert sales coach evaluating the buying intent of a prospect in a sales call.

Analyze the following sales call transcript and evaluate the prospect's buying intent across 4 key signals:

1. **Financeiro (Financial)** — Does the prospect have budget available or mention budget concerns?
   - 10: Prospect confirms budget is approved, no cost concerns
   - 7–9: Prospect mentions available budget or shows confidence about cost
   - 5–6: Prospect neutral on budget or shows mild concerns
   - 3–4: Prospect questions pricing or has budget hesitation
   - 0–2: Prospect states no budget, high price sensitivity

2. **Urgência (Urgency)** — How quickly does the prospect need to solve the problem?
   - 10: Prospect states need to solve immediately (today/this week)
   - 7–9: Prospect shows clear time pressure (within 1–2 months)
   - 5–6: Prospect shows interest but no urgency
   - 3–4: Prospect frames as "nice to have" or low priority
   - 0–2: Prospect shows no sense of urgency

3. **Autoridade (Authority)** — Is the prospect the decision-maker or influencer?
   - 10: Prospect is the sole decision-maker, no approval needed
   - 7–9: Prospect is decision-maker with minor approval
   - 5–6: Prospect has influence but needs another sign-off
   - 3–4: Prospect must check with decision-maker
   - 0–2: Prospect is gatekeeper with no buying authority

4. **Engajamento (Engagement / right questions)** — Is the prospect asking the questions of someone who is about to close (next steps, onboarding, "what happens after I sign")?
   - 10: Prospect asks buying-signal questions (next steps, start date, onboarding), takes notes, drives toward the close
   - 7–9: Prospect engaged, asks detailed questions, few objections, clear interest
   - 5–6: Prospect listens politely, asks moderate/surface questions
   - 3–4: Prospect passive, few questions, mild resistance
   - 0–2: Prospect disengaged, dismissive, or defensive

## Weight Distribution
Your scores will be combined using these weights:
- Financeiro: ${(normalizedWeights.financial * 100).toFixed(0)}%
- Urgência: ${(normalizedWeights.urgency * 100).toFixed(0)}%
- Autoridade: ${(normalizedWeights.authority * 100).toFixed(0)}%
- Engajamento: ${(normalizedWeights.engagement * 100).toFixed(0)}%

## Call Information
- Trainer: ${input.trainerName}
- Prospect: ${input.clientName}

## Transcript
<<<TRANSCRIPT_BEGIN>>>
${input.transcript}
<<<TRANSCRIPT_END>>>

## Output — strict JSON, no markdown fences, no commentary
{
  "financial": <integer 0–10>,
  "urgency": <integer 0–10>,
  "authority": <integer 0–10>,
  "engagement": <integer 0–10>,
  "reasoning": "<1–2 sentences explaining the overall intent"
}

CRITICAL CONSTRAINTS:
- Reply with JSON ONLY. No prose before or after.
- All scores MUST be integers between 0 and 10 inclusive.
- DO NOT include the markdown fences (\`\`\`) in your response.
`.trim()
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
