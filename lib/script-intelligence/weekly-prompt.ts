// Prompt da sugestão semanal de script (GLOBAL, várias orgs).
//
// Reaproveita do SYSTEM_PROMPT do Script Builder só o formato JSON e a
// definição das 5 seções — recortados do próprio texto, sem editá-lo, pra o
// Script Builder continuar recebendo exatamente o mesmo prompt. Troca a
// introdução e as regras: o Builder manda CITAR detalhes da fonte (nomes,
// preços); aqui o script vai para todas as orgs, então tem que ser anônimo.

import { SYSTEM_PROMPT } from '@/lib/script-intelligence/generate-script-prompt'

export const WEEKLY_SECTION_NAMES = [
  'Discovery',
  'Problem Agitation',
  'Offer Presentation',
  'Objection Handling',
  'Close & Next Steps',
] as const

// Corte por transcrição. As transcrições reais têm em média ~14,7 mil
// caracteres (p90 ~32 mil); 15 delas inteiras podem passar de 120 mil tokens.
export const WEEKLY_MAX_TRANSCRIPT_CHARS = 8000

function sliceBetween(text: string, start: string, end: string): string {
  const i = text.indexOf(start)
  const j = text.indexOf(end)
  if (i < 0 || j < 0 || j <= i) {
    throw new Error(`weekly-prompt: marcadores não encontrados no SYSTEM_PROMPT ("${start}" → "${end}")`)
  }
  return text.slice(i, j).trimEnd()
}

// "Respond ONLY with a valid JSON …" até antes de "## Rules": formato + seções.
const SHARED_SHAPE_AND_SECTIONS = sliceBetween(SYSTEM_PROMPT, 'Respond ONLY with a valid JSON', '## Rules')

export const WEEKLY_SYSTEM_PROMPT = `You are a sales script architect for dog training businesses. You receive transcripts of WINNING sales calls — calls where the lead booked and then became a paying customer — from several different dog training businesses. Extract the patterns that recur in these winning calls (discovery questions, how the problem was agitated, how the offer was framed, responses to objections, how the close was made) and turn them into ONE generic sales script that any of these businesses could use, split across exactly 5 fixed sections, in the exact order and with the exact meaning defined below.

${SHARED_SHAPE_AND_SECTIONS}

## Rules
- The sections array must contain EXACTLY these 5 sections in this exact order, with these exact names: Discovery, Problem Agitation, Offer Presentation, Objection Handling, Close & Next Steps. Do not add, remove, or rename any section.
- Base every section on patterns that actually appear in the winning calls. Prefer patterns that show up in calls from more than one business over something a single call did once.
- ANONYMIZE. The script goes to many different businesses. Never include names of businesses, people (trainers, owners, customers), dogs, brands, products, programs, or locations. Never include prices, fees, amounts, discounts, package costs, phone numbers, or dates. Where the script needs one of these, use a neutral placeholder such as [business name], [trainer name], [dog's name], [program name], [price], [date].
- Each section's "instructions" must describe what the trainer should DO/SAY in that part of the call, written as concrete guidance or example lines taken from the winning patterns — not a generic label repeated across sections.
- "tips" is one short, section-specific coaching tip — it must be different in substance for each section, never a generic reused sentence.
- weight values must sum to exactly 100 across all 5 sections, reflecting how much each section matters based on the material (e.g. weight Objection Handling and Close higher if the calls show those are where deals are won).
- Mark critical: true for sections where failure is eliminatory (typically Discovery, Problem Agitation, Objection Handling) — set this based on the actual material, not by default.
- "full_script" must contain all 5 sections in order, each clearly headed by its section name, forming one coherent script a trainer could read top-to-bottom on a live call. It follows the same anonymization rule.`

export interface WeeklyPromptOrg {
  calls: { transcript: string }[]
}

/** Uma letra por org ("Business A", "B"…) — o modelo vê a diversidade sem ver o nome. */
export function buildWeeklyUserPrompt(orgs: WeeklyPromptOrg[]): string {
  const totalCalls = orgs.reduce((n, o) => n + o.calls.length, 0)
  const parts: string[] = [
    `## Winning call transcripts (${totalCalls} calls from ${orgs.length} different businesses)`,
  ]

  orgs.forEach((org, orgIdx) => {
    const label = String.fromCharCode(65 + (orgIdx % 26))
    org.calls.forEach((call, callIdx) => {
      const text =
        call.transcript.length > WEEKLY_MAX_TRANSCRIPT_CHARS
          ? `${call.transcript.slice(0, WEEKLY_MAX_TRANSCRIPT_CHARS)}\n[transcript truncated]`
          : call.transcript
      parts.push(`### Business ${label} — call ${callIdx + 1}\n${text}`)
    })
  })

  parts.push(
    `\n## Task\nIdentify what these winning calls have in common in each of the 5 sections and write ONE anonymized script from those patterns, following every rule in the system prompt. Output only the JSON object.`,
  )

  return parts.join('\n\n')
}

/**
 * Valida o script devolvido pela IA antes de gravar. Retorna o motivo do
 * erro, ou null quando está válido. Os pesos seguem como o cron sempre usou
 * (o que a IA devolver) — aqui só se exige a estrutura das 5 seções.
 */
export function validateWeeklyScript(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return 'Resposta da IA não é um objeto JSON'
  const p = parsed as { name?: unknown; sections?: unknown }

  if (typeof p.name !== 'string' || p.name.trim() === '') return 'Campo "name" ausente ou vazio'
  if (!Array.isArray(p.sections)) return 'Campo "sections" ausente ou não é lista'
  if (p.sections.length !== WEEKLY_SECTION_NAMES.length) {
    return `Esperadas ${WEEKLY_SECTION_NAMES.length} seções, vieram ${p.sections.length}`
  }

  for (let i = 0; i < WEEKLY_SECTION_NAMES.length; i++) {
    const s = p.sections[i] as { name?: unknown; instructions?: unknown } | null
    const expected = WEEKLY_SECTION_NAMES[i]
    if (!s || s.name !== expected) {
      return `Seção ${i + 1} deveria ser "${expected}", veio "${String(s?.name ?? '')}"`
    }
    if (typeof s.instructions !== 'string' || s.instructions.trim() === '') {
      return `Seção "${expected}" sem instructions`
    }
  }

  return null
}
