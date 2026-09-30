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
// O corte guarda o COMEÇO e o FIM da call (metade do orçamento cada): objeção
// e pedido de agendamento ficam no fim, e cortar só o começo deixava o modelo
// sem nada para citar em Objection Handling e Close.
export const WEEKLY_MAX_TRANSCRIPT_CHARS = 8000
export const WEEKLY_TRUNCATION_MARKER = '[… middle of the call omitted …]'

export function truncateTranscript(transcript: string): string {
  if (transcript.length <= WEEKLY_MAX_TRANSCRIPT_CHARS) return transcript
  const half = WEEKLY_MAX_TRANSCRIPT_CHARS / 2
  return `${transcript.slice(0, half)}\n${WEEKLY_TRUNCATION_MARKER}\n${transcript.slice(-half)}`
}

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
- Base every section on patterns that actually appear in the winning calls. Prefer patterns that show up in calls from more than one business over something a single call did once; when choosing which lines to quote, pick the ones whose idea recurs across businesses first.
- ANONYMIZE. The script goes to many different businesses. Never include names of businesses, people (trainers, owners, customers), dogs, brands, products, programs, or locations. Never include prices, fees, amounts, discounts, package costs, phone numbers, or dates. Where the script needs one of these, use a neutral placeholder such as [business name], [trainer name], [dog's name], [program name], [price], [date]. This applies INSIDE quoted lines too.
- The "best-practice fallback line" allowed in the section definitions above does NOT apply here. Every line must come from the transcripts.

## Concrete examples — mandatory in every section
- Each section's "instructions" = one or two sentences saying what the winning trainers did in that part of the call, then 2 to 4 example lines in speech format, each on its own line:
  Ask: '<question the trainer asked>'
  Say: '<statement the trainer made>'
- Example lines are taken from the transcripts: quote the trainer's actual words, or condense them lightly without changing the meaning. Never invent a line that no winning trainer said.
- Objection Handling: write objection → response pairs, one per line, in the form Objection: '<what the lead said>' → Say: '<what the trainer answered>'. Cover each of these when it appears in the transcripts: price/cost, "I need to talk to my partner/spouse", "I'll think about it", and time/schedule. If one of them never appears in the transcripts, leave it out — do not make up a response.
- Close & Next Steps: include the exact booking ask the winning trainers used to schedule the appointment/evaluation, as a Say: '…' or Ask: '…' line, plus how they confirmed the date and next step.
- FORBIDDEN: generic sales advice that would fit any sale in any industry, e.g. "Use open-ended questions", "Build rapport", "Listen actively", "Create urgency", "Handle objections with empathy", "Be confident". If a sentence would still make sense in a car dealership or a software demo, replace it with what the dog trainers in these calls actually said.
- "tips" is one short, section-specific coaching tip drawn from what the winners did differently — different in substance for each section, and never generic advice (same FORBIDDEN rule).
- weight values must sum to exactly 100 across all 5 sections, reflecting how much each section matters based on the material (e.g. weight Objection Handling and Close higher if the calls show those are where deals are won).
- Mark critical: true for sections where failure is eliminatory (typically Discovery, Problem Agitation, Objection Handling) — set this based on the actual material, not by default.
- "full_script" must contain all 5 sections in order, each clearly headed by its section name, forming one coherent script a trainer could read top-to-bottom on a live call, including the Ask/Say example lines and the objection → response pairs. It follows the same anonymization rule.`

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
      parts.push(`### Business ${label} — call ${callIdx + 1}\n${truncateTranscript(call.transcript)}`)
    })
  })

  parts.push(
    `\n## Task\nIdentify what these winning calls have in common in each of the 5 sections and write ONE anonymized script from those patterns, following every rule in the system prompt. Every section needs 2 to 4 Ask/Say lines quoted from these transcripts (Objection Handling as objection → response pairs; Close with the booking ask the winners used), and no generic sales advice. Output only the JSON object.`,
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
