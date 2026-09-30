// Checagem de anonimização do script semanal da rede (antes de gravar).
//
// O prompt (weekly-prompt.ts) já manda anonimizar, mas é só instrução ao
// modelo. Aqui o código confere o resultado: se o script trouxer um valor
// monetário ou o nome de uma org incluída, de um trainer ou de um lead das
// calls usadas, a rodada vira erro e nada é gravado nem enviado.
//
// Regras de nome (case-insensitive, palavras inteiras, espaços normalizados):
//   - org: nome completo, e sem sufixo societário (LLC, Inc…);
//   - pessoa (trainer e lead): nome completo + primeiro e último nome com 3+
//     letras. Os nomes no CRM vêm sujos ("Cheryl SADIE Golden Retriever
//     Davis": o lead com o cão e a raça no meio); comparar palavra por
//     palavra barraria "Golden"/"Retriever" em qualquer script de
//     adestramento. É pelo primeiro/último nome que o modelo costuma vazar.
//   - placeholders de sistema ("Front Desk - AskMoses", "Unknown trainer",
//     "—") não contam.
//
// Campos conferidos: os que são gravados e chegam ao cliente — name,
// description, sections (name/instructions/tips) e full_script.

import { FRONT_DESK_NAME } from '@/lib/constants/front-desk'

export type LeakKind = 'money' | 'org' | 'trainer' | 'lead'

export interface AnonymizationTerm {
  kind: Exclude<LeakKind, 'money'>
  /** O termo como aparece no aviso (nome já normalizado). */
  term: string
  pattern: RegExp
}

export interface AnonymizationLeak {
  kind: LeakKind
  term: string
  field: string
  excerpt: string
}

const IGNORED_NAMES = new Set(
  [FRONT_DESK_NAME, 'Unknown trainer', '—', '-'].map((n) => n.toLowerCase()),
)

const LEGAL_SUFFIX = /[\s,]+(llc|l\.l\.c\.|inc\.?|ltd\.?|co\.?|corp\.?)$/i

// Valor monetário: símbolo + número ($150, US$ 1,200, R$ 99, € 50, £30, $2k)
// ou número + moeda por extenso (150 dollars, 99 bucks, 50 USD).
// O número termina sempre em dígito — "$1,200." não leva o ponto final junto.
const MONEY_PATTERNS: RegExp[] = [
  /(?:US\$|R\$|\$|€|£)\s?\d(?:[\d.,]*\d)?(?:\s?[kK]\b)?/,
  /\b\d(?:[\d.,]*\d)?\s?(?:dollars?|bucks|usd|reais|euros?)\b/i,
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
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu')
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
    terms.add(tokens[0])
    terms.add(tokens[tokens.length - 1])
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

export function buildAnonymizationTerms(
  included: {
    orgName: string
    calls: { trainerName: string | null; clientName: string | null }[]
  }[],
): AnonymizationTerm[] {
  const byKey = new Map<string, AnonymizationTerm>()
  const add = (t: AnonymizationTerm) => {
    const key = `${t.kind}|${t.term.toLowerCase()}`
    if (!byKey.has(key)) byKey.set(key, t)
  }
  for (const org of included) {
    orgTerms(org.orgName).forEach(add)
    for (const call of org.calls) {
      personTerms(call.trainerName, 'trainer').forEach(add)
      personTerms(call.clientName, 'lead').forEach(add)
    }
  }
  return [...byKey.values()]
}

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 40)
  const end = Math.min(text.length, index + length + 40)
  const core = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${core}${end < text.length ? '…' : ''}`
}

function textFields(parsed: unknown): { field: string; text: string }[] {
  const p = (parsed ?? {}) as {
    name?: unknown
    description?: unknown
    full_script?: unknown
    sections?: unknown
  }
  const out: { field: string; text: string }[] = []
  const push = (field: string, v: unknown) => {
    if (typeof v === 'string' && v.length > 0) out.push({ field, text: v })
  }
  push('name', p.name)
  push('description', p.description)
  if (Array.isArray(p.sections)) {
    p.sections.forEach((s, i) => {
      const sec = (s ?? {}) as { name?: unknown; instructions?: unknown; tips?: unknown }
      const label = typeof sec.name === 'string' ? sec.name : `#${i + 1}`
      push(`sections[${label}].name`, sec.name)
      push(`sections[${label}].instructions`, sec.instructions)
      push(`sections[${label}].tips`, sec.tips)
    })
  }
  push('full_script', p.full_script)
  return out
}

/** Primeiro vazamento encontrado, ou null. Valor monetário é conferido antes dos nomes. */
export function findAnonymizationLeak(
  parsed: unknown,
  terms: AnonymizationTerm[],
): AnonymizationLeak | null {
  const fields = textFields(parsed)

  for (const { field, text } of fields) {
    for (const re of MONEY_PATTERNS) {
      const m = re.exec(text)
      if (m) return { kind: 'money', term: m[0], field, excerpt: excerptAround(text, m.index, m[0].length) }
    }
  }

  for (const { field, text } of fields) {
    for (const t of terms) {
      const m = t.pattern.exec(text)
      if (m) return { kind: t.kind, term: t.term, field, excerpt: excerptAround(text, m.index, m[0].length) }
    }
  }

  return null
}

const KIND_LABEL: Record<LeakKind, string> = {
  money: 'valor monetário',
  org: 'nome de org',
  trainer: 'nome de trainer',
  lead: 'nome de lead',
}

/** Texto gravado em script_suggestion_runs.error. */
export function describeLeak(leak: AnonymizationLeak): string {
  return `Anonimização: ${KIND_LABEL[leak.kind]} "${leak.term}" em ${leak.field}: "${leak.excerpt}"`
}
