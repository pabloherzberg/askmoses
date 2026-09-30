import { generateText } from 'ai'
// scoring_engine — mesmo módulo do gate embutido em app/api/analyze/route.ts
// (buildDefaultSystemPrompt). Usado só para reclassificar calls legadas
// (is_sales_call = NULL) sem reanalisar score/intent — ver checklist §2.2.
import { getActiveLlmModel } from '@/lib/llm-provider'
import { getModuleTuning } from '@/lib/db/ai-module-configs'

export interface SalesCallClassificationResult {
  isSalesCall: boolean
  reasoning: string
}

// Mesmo critério do "SALES CALL GATE" em app/api/analyze/route.ts
// (buildDefaultSystemPrompt) — mantido idêntico de propósito, pra não
// introduzir uma segunda definição de "o que é uma sales call" divergente.
export async function classifySalesCall(transcript: string): Promise<SalesCallClassificationResult> {
  const prompt = `You are checking whether a call transcript is a sales call.

SALES CALL GATE:
Determine whether this transcript is actually a sales call — a conversation where one party is presenting/selling a product or service to a prospect, with some attempt at discovery, presenting an offer, handling objections, or closing.
It is NOT a sales call when the transcript is, for example: an internal team meeting, a customer-support/troubleshooting call, a personal conversation, silence/dead air, test audio, a wrong-number call, or any recording where no selling activity is taking place.
When in doubt, prefer true (mark it as a sales call) UNLESS the transcript gives a clear signal otherwise — a false positive on this gate costs far less than incorrectly discarding a real sales call. Examples:
- English: an internal standup ("okay team, let's review this week's numbers"), a support call ("I'm having trouble logging into my account") → isSalesCall: false. A discovery call with a prospect, a pitch, objection handling, or a close attempt → isSalesCall: true.
- Portuguese: uma reunião de equipe interna ("bom dia pessoal, vamos revisar as métricas da semana"), um chamado de suporte técnico ("meu login não está funcionando") → isSalesCall: false. Uma call de descoberta com prospect, apresentação de oferta, tratamento de objeção ou tentativa de fechamento → isSalesCall: true.

## Transcript
<<<TRANSCRIPT_BEGIN>>>
${transcript}
<<<TRANSCRIPT_END>>>

## Output — strict JSON, no markdown fences, no commentary
{
  "isSalesCall": <true|false>,
  "reasoning": "<1 sentence>"
}`.trim()

  const { model } = await getActiveLlmModel('gpt-4o-mini')
  const tuning = await getModuleTuning('scoring_engine')
  const llmResult = await generateText({
    model,
    prompt,
    temperature: tuning.temperature,
    maxOutputTokens: tuning.max_tokens,
  })

  try {
    const json = JSON.parse(llmResult.text)
    return {
      isSalesCall: typeof json.isSalesCall === 'boolean' ? json.isSalesCall : true,
      reasoning: typeof json.reasoning === 'string' ? json.reasoning : '',
    }
  } catch {
    // Mesma regra de "quando em dúvida, true" do gate original.
    return { isSalesCall: true, reasoning: 'fallback: parse failed' }
  }
}
