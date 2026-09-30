// Anonimização do script semanal da rede, aplicada pelo CÓDIGO antes de gravar.
//
// O prompt (weekly-prompt.ts) já manda anonimizar, mas é só instrução ao
// modelo. Aqui o código SUBSTITUI o que escapou:
//   - valor monetário              → [price]
//   - nome de org incluída          → [business name]
//   - nome de trainer ou lead das calls usadas → [name]
// A rodada não é barrada por isso; o que foi substituído fica registrado em
// script_suggestion_runs.redactions (tipo, campo e quantidade — nunca o termo
// original, para não guardar o dado que foi removido).
//
// Regras de nome (case-insensitive, palavras inteiras, espaços normalizados):
//   - org: nome completo, e sem sufixo societário (LLC, Inc…);
//   - pessoa (trainer e lead): nome completo + primeiro e último nome com 3+
//     letras. Os nomes no CRM vêm sujos ("Cheryl SADIE Golden Retriever
//     Davis": o lead com o cão e a raça no meio); as palavras do meio ficam
//     de fora, senão "Golden"/"Retriever" sumiriam de qualquer script;
//   - primeiro/último nome que também é palavra comum em inglês
//     (COMMON_WORD_NAMES) não é substituído sozinho — só o nome completo;
//   - placeholders de sistema ("Front Desk - AskMoses", "Unknown trainer",
//     "—") não contam.
//
// Campos tratados: name, description, sections[].instructions/tips e
// full_script. sections[].name fica de fora — são os 5 nomes fixos já
// validados.

import { FRONT_DESK_NAME } from '@/lib/constants/front-desk'

export type RedactionKind = 'money' | 'org' | 'trainer' | 'lead'

export interface AnonymizationTerm {
  kind: Exclude<RedactionKind, 'money'>
  /** O termo normalizado (só em memória — nunca é gravado). */
  term: string
  pattern: RegExp
}

/** Uma linha por (tipo, campo). Sem o termo original, de propósito. */
export interface Redaction {
  kind: RedactionKind
  field: string
  count: number
}

export const PLACEHOLDER: Record<RedactionKind, string> = {
  money: '[price]',
  org: '[business name]',
  trainer: '[name]',
  lead: '[name]',
}

// Primeiro/último nome que também é palavra comum em inglês não é substituído
// sozinho — só o nome completo. Sem esta lista, "stiff body language"
// viraria "[name] body language" por causa de um lead chamado Matthew Stiff.
// Lista curta e explícita: cores, adjetivos e substantivos que aparecem em
// script de adestramento ou são nomes frequentes.
export const COMMON_WORD_NAMES: ReadonlySet<string> = new Set([
  'stiff', 'white', 'lamp', 'golden', 'brown', 'young', 'black', 'green', 'gray', 'grey',
  'little', 'long', 'short', 'small', 'strong', 'sharp', 'rich', 'wise', 'early', 'love',
  'hope', 'grace', 'joy', 'faith', 'will', 'may', 'bell', 'king', 'park', 'hill',
  'stone', 'wood', 'field', 'lane', 'story', 'walker', 'baker', 'fisher', 'hunter', 'miller',
])

const IGNORED_NAMES = new Set(
  [FRONT_DESK_NAME, 'Unknown trainer', '—', '-'].map((n) => n.toLowerCase()),
)

const LEGAL_SUFFIX = /[\s,]+(llc|l\.l\.c\.|inc\.?|ltd\.?|co\.?|corp\.?)$/i

// Valor monetário: símbolo + número ($150, US$ 1,200, R$ 99, € 50, £30, $2k)
// ou número + moeda por extenso (150 dollars, 99 bucks, 50 USD). O número
// termina sempre em dígito — "$1,200." não leva o ponto final junto.
const MONEY_PATTERNS: RegExp[] = [
  /(?:US\$|R\$|\$|€|£)\s?\d(?:[\d.,]*\d)?(?:\s?[kK]\b)?/g,
  /\b\d(?:[\d.,]*\d)?\s?(?:dollars?|bucks|usd|reais|euros?)\b/gi,
]

// new RegExp em vez de literal: o tsconfig mira ES6 e o TS recusa \p{…} em literal.
const LETTERS_ONLY_3PLUS = new RegExp('^\\p{L}{3,}$', 'u')

function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Palavra(s) inteira(s), sem diferenciar maiúsculas; espaço no nome casa com qualquer espaço. */
function wholeWords(term: string): RegExp {
  const body = term.split(' ').map(escapeRegex).join('\\s+')
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu')
}

function isUsableName(name: string): boolean {
  return name.length > 0 && !IGNORED_NAMES.has(name.toLowerCase())
}

function personTerms(raw: string | null | undefined, kind: 'trainer' | 'lead'): AnonymizationTerm[] {
  if (!raw) return []
  const full = normalizeName(raw)
  if (!isUsableName(full)) return []

  const terms = new Set<string>([full])
  const tokens = full.split(' ').filter((t) => LETTERS_ONLY_3PLUS.test(t))
  if (tokens.length > 0) {
    for (const t of [tokens[0], tokens[tokens.length - 1]]) {
      if (!COMMON_WORD_NAMES.has(t.toLowerCase())) terms.add(t)
    }
  }
  return [...terms].map((term) => ({ kind, term, pattern: wholeWords(term) }))
}

function orgTerms(raw: string): AnonymizationTerm[] {
  const full = normalizeName(raw)
  // < 3 caracteres casaria com palavras comuns ("A" com o artigo "a").
  if (!isUsableName(full) || full.length < 3) return []
  const terms = new Set<string>([full])
  const withoutSuffix = full.replace(LEGAL_SUFFIX, '').trim()
  if (withoutSuffix.length > 0) terms.add(withoutSuffix)
  return [...terms].map((term) => ({ kind: 'org' as const, term, pattern: wholeWords(term) }))
}

/**
 * Termos a substituir, do mais longo para o mais curto — o nome completo
 * ("Austin Ackerman") é trocado antes do primeiro nome ("Austin"), senão o
 * texto viraria "[name] [name]".
 */
export function buildAnonymizationTerms(
  included: {
    orgName: string
    calls: { trainerName: string | null; clientName: string | null }[]
  }[],
): AnonymizationTerm[] {
  const byKey = new Map<string, AnonymizationTerm>()
  const add = (t: AnonymizationTerm) => {
    const key = t.term.toLowerCase()
    // Mesmo termo como org e como pessoa: vale o primeiro (org entra antes).
    if (!byKey.has(key)) byKey.set(key, t)
  }
  for (const org of included) {
    orgTerms(org.orgName).forEach(add)
    for (const call of org.calls) {
      personTerms(call.trainerName, 'trainer').forEach(add)
      personTerms(call.clientName, 'lead').forEach(add)
    }
  }
  return [...byKey.values()].sort((a, b) => b.term.length - a.term.length)
}

export interface RedactableScript {
  name?: unknown
  description?: unknown
  sections?: unknown
  full_script?: unknown
}

/**
 * Devolve uma cópia do script com os termos substituídos e a lista do que
 * foi substituído (tipo, campo, quantidade). O script de entrada não é
 * alterado.
 */
export function redactScript<T extends RedactableScript>(
  parsed: T,
  terms: AnonymizationTerm[],
): { script: T; redactions: Redaction[] } {
  const counts = new Map<string, Redaction>()
  const bump = (kind: RedactionKind, field: string, n: number) => {
    if (n === 0) return
    const key = `${kind}|${field}`
    const r = counts.get(key) ?? { kind, field, count: 0 }
    r.count += n
    counts.set(key, r)
  }

  const redactText = (field: string, text: string): string => {
    let out = text
    for (const re of MONEY_PATTERNS) {
      out = out.replace(re, () => {
        bump('money', field, 1)
        return PLACEHOLDER.money
      })
    }
    for (const t of terms) {
      out = out.replace(t.pattern, () => {
        bump(t.kind, field, 1)
        return PLACEHOLDER[t.kind]
      })
    }
    return out
  }

  const redactField = (field: string, value: unknown): unknown =>
    typeof value === 'string' ? redactText(field, value) : value

  const script: Record<string, unknown> = { ...(parsed as unknown as Record<string, unknown>) }
  script.name = redactField('name', parsed.name)
  script.description = redactField('description', parsed.description)
  script.full_script = redactField('full_script', parsed.full_script)
  if (Array.isArray(parsed.sections)) {
    script.sections = parsed.sections.map((s: unknown, i: number) => {
      const sec = (s ?? {}) as Record<string, unknown>
      const label = typeof sec.name === 'string' ? sec.name : `#${i + 1}`
      return {
        ...sec,
        instructions: redactField(`sections[${label}].instructions`, sec.instructions),
        tips: redactField(`sections[${label}].tips`, sec.tips),
      }
    })
  }

  return { script: script as T, redactions: [...counts.values()] }
}
