import { generateText } from 'ai'
// correlation_engine — Script Gap Detection é um dos serviços do módulo
// correlation_engine (ver lib/constants/ai-modules.ts). Provider/chave do
// provider ativo; tuning (temperature/max_tokens) de correlation_engine.
import { getActiveLlmModel } from '@/lib/llm-provider'
import { getModuleTuning } from '@/lib/db/ai-module-configs'
import { createAdminClient } from '@/lib/supabase/admin'
import { dbGetActiveOrgScript } from '@/lib/db/scripts'
import { recordLlmUsage } from '@/lib/services/llm-usage'
import type { ScriptSection } from '@/lib/db/scripts'
import type { NewScriptGap } from '@/lib/db/script-gaps'

// Script Gap Detection — distinto do Script Intelligence. Aqui a IA cruza DUAS
// perspectivas: o que o SCRIPT instrui o vendedor a fazer vs. o que ACONTECE NA
// CONVERSA na prática (vendedor E prospect). O foco é o ATRITO: onde o script
// empurra numa direção que colide com o comportamento, as objeções e os padrões
// de linguagem dos prospects daquelas calls — e a sugestão cirúrgica de
// reescrita apenas do trecho com fricção.
const SYSTEM_PROMPT = `You are a senior sales coach specialising in dog training businesses.

You will receive:
1. The ACTIVE script (sections with name, instructions, tips)
2. Up to 3 recent call transcripts with scores and outcomes

Your task: detect SCRIPT GAPS — points where the script instructs the rep to do
something that creates FRICTION in the actual conversations. A gap is NOT about
script coverage or quality in isolation; it is about a CLASH between what the
script tells the rep to do and what the prospects actually do (their objections,
reactions, language patterns) across these calls.

Respond ONLY with a valid JSON object — no markdown, no explanation outside JSON:
{
  "gaps": [
    {
      "section": "string — EXACT section name from the active script",
      "scriptInstruction": "string — what the script currently instructs the rep to do in that section (paraphrase the instruction faithfully)",
      "observedPattern": "string — what actually happens in the conversations, citing both rep behaviour AND prospect reactions/objections/language grounded in the transcripts",
      "callNumbers": [number] — the Call numbers (1-based, as labelled below) where THIS friction actually appears. List ONLY calls where you can point to the friction in the transcript,
      "severity": "high" | "medium" | "low",
      "suggestedFix": "string — a surgical rewrite of ONLY the friction segment; concrete language the rep should use instead, not generic advice"
    }
  ]
}

Rules:
- ALWAYS write "scriptInstruction", "observedPattern" and "suggestedFix" in
  English, regardless of the language of the active script or the call
  transcripts. Even when the calls are in another language, your output text
  must be English.
- Only report REAL friction grounded in the transcripts — do not invent gaps.
- "section" MUST match one of the active script section names exactly.
- callNumbers: list every Call number where the friction is observable, and ONLY
  those. Do not include a call unless the transcript shows the friction. Never
  invent call numbers outside the range provided.
- severity: high if it blocks the close or recurs in most calls; medium if it
  weakens the conversation; low if it is a missed opportunity.
- suggestedFix must be a drop-in replacement for the friction segment only —
  never a rewrite of the whole script.
- Return between 1 and 5 gaps, ordered by severity (high first).
- If you find no genuine friction, return { "gaps": [] }.`

function buildPrompt(
  script: { name: string; sections: ScriptSection[] },
  calls: Array<{ transcript: string; overall_score: number | null; call_outcome: string | null }>,
): string {
  const parts: string[] = []

  parts.push(`## Active Script: "${script.name}"`)
  script.sections.forEach((s, i) => {
    parts.push(`**${i + 1}. ${s.name}**\nInstructions: ${s.instructions}\nTips: ${s.tips}`)
  })

  parts.push(`\n## Call Transcripts (${calls.length} calls)`)
  calls.forEach((call, i) => {
    const outcome = call.call_outcome ?? 'unknown'
    const score = call.overall_score != null ? `${call.overall_score}/100` : 'unscored'
    parts.push(`### Call ${i + 1} — Outcome: ${outcome} | Score: ${score}\n${call.transcript}`)
  })

  parts.push(`\n## Task
For each section of the active script, check whether the instruction clashes with
what the prospects actually do in these calls. Where it does, produce a gap with a
surgical rewrite of only the friction segment.`)

  return parts.join('\n\n')
}

export type AnalyzeGapsResult =
  | { ok: true; gaps: NewScriptGap[]; callIds: string[]; modelUsed: string }
  | { ok: false; error: string }

const MODEL = 'gpt-4o-mini'
const VALID_SEVERITY = new Set(['high', 'medium', 'low'])

/**
 * Gera os Script Gaps da org ativa a partir do script ativo + calls recentes.
 * Não persiste — devolve os gaps para o service decidir como gravar.
 */
export async function runScriptGapDetection(orgId: string): Promise<AnalyzeGapsResult> {
  const script = await dbGetActiveOrgScript(orgId)
  if (!script) return { ok: false, error: 'No active script for this organization' }
  if (!Array.isArray(script.sections) || script.sections.length === 0) {
    return { ok: false, error: 'Active script has no sections' }
  }

  const admin = createAdminClient()
  const { data: callsRaw } = await admin
    .from('calls')
    .select('id, transcript, overall_score, call_outcome')
    .eq('org_id', orgId)
    .not('transcript', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20)

  const eligible = (callsRaw ?? []).filter(
    (c: { transcript: string | null }) => c.transcript && c.transcript.length > 100,
  )
  // A feature é definida como "analisa 3 calls da organização".
  const selected = eligible.slice(0, 3)

  if (selected.length === 0) {
    return { ok: false, error: 'No calls with transcripts found' }
  }

  const callIds = selected.map((c) => c.id as string)
  // Transcript COMPLETO — truncar perde o contexto da conversa e inviabiliza a
  // detecção de atrito (objeções, reações do prospect podem estar em qualquer
  // ponto da call). São só 3 calls; cabem com folga na janela do gpt-4o-mini.
  const calls = selected.map((c) => ({
    transcript: c.transcript as string,
    overall_score: c.overall_score as number | null,
    call_outcome: c.call_outcome as string | null,
  }))

  const prompt = buildPrompt({ name: script.name, sections: script.sections }, calls)

  let text: string
  let usageProvider = 'openai'
  let usageModel: string = MODEL
  try {
    const { model, provider, modelId } = await getActiveLlmModel(MODEL)
    const tuning = await getModuleTuning('correlation_engine')
    usageProvider = provider
    usageModel = modelId
    const aiResult = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt,
      temperature: tuning.temperature,
      maxOutputTokens: tuning.max_tokens,
    })
    text = aiResult.text
    // Telemetria de custo p/ COGS (best-effort).
    void recordLlmUsage({
      orgId,
      surface: 'script_gap',
      provider: usageProvider,
      model: usageModel,
      inputTokens: aiResult.usage?.inputTokens ?? 0,
      outputTokens: aiResult.usage?.outputTokens ?? 0,
      ref: script.id,
    })
  } catch (err) {
    return { ok: false, error: `AI call failed: ${err instanceof Error ? err.message : 'unknown'}` }
  }

  let parsed: {
    gaps: Array<{
      section: string
      scriptInstruction: string
      observedPattern: string
      callNumbers: unknown
      severity: string
      suggestedFix: string
    }>
  }

  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed.gaps)) throw new Error('Invalid structure')
  } catch {
    return { ok: false, error: 'AI returned invalid JSON' }
  }

  const sectionNames = script.sections.map((s) => s.name)
  const totalCalls = callIds.length

  const gaps: NewScriptGap[] = parsed.gaps
    .filter(
      (g) =>
        g &&
        typeof g.section === 'string' &&
        typeof g.scriptInstruction === 'string' &&
        typeof g.observedPattern === 'string' &&
        typeof g.suggestedFix === 'string',
    )
    .flatMap((g) => {
      // Mapeia os índices 1-based devolvidos pela IA para os call IDs reais
      // (pela ordem em que as calls entraram no prompt). frequency é DERIVADO
      // dessa contagem, não do que a IA "achou". Gaps sem nenhuma call válida
      // são descartados — todo gap exibido é rastreável a calls reais.
      const matchingCallIds = [
        ...new Set(
          (Array.isArray(g.callNumbers) ? g.callNumbers : [])
            .map((n) => (typeof n === 'number' ? n : Number(n)))
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= totalCalls)
            .map((n) => callIds[n - 1]),
        ),
      ]

      if (matchingCallIds.length === 0) return []

      // Casa o nome devolvido pela IA com o nome canônico da section (case-insensitive),
      // para o Accept Gap encontrar a section certa ao reescrever o script.
      const canonical =
        sectionNames.find((n) => n.toLowerCase().trim() === g.section.toLowerCase().trim()) ??
        g.section
      const severity = VALID_SEVERITY.has(g.severity) ? (g.severity as NewScriptGap['severity']) : 'medium'
      const frequency = Math.round((matchingCallIds.length / totalCalls) * 100)

      return [{
        section: canonical,
        script_instruction: g.scriptInstruction,
        observed_pattern: g.observedPattern,
        frequency,
        severity,
        suggested_fix: g.suggestedFix,
        calls_analyzed: callIds,
        matching_call_ids: matchingCallIds,
      }]
    })

  return { ok: true, gaps, callIds, modelUsed: usageModel }
}
