import type { DbScript, ScriptSection } from '@/lib/db/scripts'

// ════════════════════════════════════════════════════════════════════════
// Mock de "Script Intelligence improvement" pra Fase 1 (demo navegável).
//
// A tela /admin/script-review/[scriptId] mostra um diff entre o script base
// e uma versão "melhorada pela IA". Na Fase 2 isso vem de um endpoint real
// de AI; aqui geramos um improvement DETERMINÍSTICO a partir do script real
// — mesmas sections, com algumas marcadas como modified/new + reasoning
// sintético. Determinístico = mesma entrada sempre gera o mesmo diff, então
// a demo é estável entre reloads.
// ════════════════════════════════════════════════════════════════════════

export type SectionChangeType = 'unchanged' | 'modified' | 'new'

export interface ReviewCriterion {
  name: string
  description: string
  isNew: boolean
}

export interface ReviewSection {
  name: string
  instructions: string
  tips: string
  weight: number
  critical: boolean
  changeType: SectionChangeType
  // Reasoning da IA — só preenchido pra modified/new.
  reasoning: string | null
  criteria: ReviewCriterion[]
  // Snapshot do conteúdo anterior — usado pela aba Diff. Null pra 'new'.
  previous: { instructions: string; tips: string } | null
}

export interface ChangeSummaryItem {
  section: string
  type: 'modified' | 'new' | 'weight' | 'tip'
}

export interface ScriptReviewData {
  scriptId: string
  scriptName: string
  baseVersion: string
  newVersion: string
  callsAnalyzed: number
  expectedImpact: number
  sections: ReviewSection[]
  changesSummary: ChangeSummaryItem[]
  metadata: {
    author: string
    date: string
    sectionsCount: number
    criteriaCount: number
  }
}

// Reasonings sintéticos rotacionados por índice — soam plausíveis sem AI.
const MOCK_REASONINGS = [
  'Closed-call analysis shows reps who open with explicit purpose-setting book 23% more follow-ups. Tightened the opening to lead with the call goal.',
  'Top performers spend 40% more time on pain discovery before pitching. Added emotional-investment probes to surface stakes earlier.',
  'Objection handling was too scripted — winning calls acknowledge the concern first. Reworded to lead with empathy, then reframe.',
  'Closing language was passive. Updated to assume the next step and offer two concrete time options.',
]

// Versões "anteriores" (v2.0) sintéticas — propositalmente mais vagas e
// curtas que o script real (a versão "proposta/IA"). Sem isso o diff
// mostrava o mesmo texto nos dois lados. Rotacionadas por índice.
const MOCK_PREVIOUS = [
  {
    instructions:
      'Greet the prospect and introduce yourself. Mention the company and ask how their day is going before moving on.',
    tips: 'Be friendly and keep it short.',
  },
  {
    instructions:
      'Ask the prospect a few questions about their dog and what kind of help they are looking for.',
    tips: 'Take notes while they talk.',
  },
  {
    instructions:
      'When the prospect raises a concern about price or time, address it and explain the value of the program.',
    tips: 'Stay calm and do not get defensive.',
  },
  {
    instructions:
      'Ask the prospect if they want to move forward and try to schedule the next step.',
    tips: 'Be direct about the next step.',
  },
]

// Bump a versão minor: "2.0" → "2.1". Se não tiver ponto, assume ".1".
function bumpMinor(version: string): string {
  const parts = version.split('.')
  if (parts.length !== 2) return `${version}.1`
  const major = parts[0]
  const minor = Number(parts[1])
  return `${major}.${isFinite(minor) ? minor + 1 : 1}`
}

/**
 * Gera o ScriptReviewData mock a partir de um script real.
 *
 * Regra determinística: sections em índice par (0,2,4…) viram 'modified'
 * com reasoning; a última section ganha uma criterion 'New'. Se o script
 * tem 0 sections, retorna estrutura vazia coerente.
 */
export function buildMockImprovement(
  script: DbScript,
  baseVersion: string,
): ScriptReviewData {
  const sections: ScriptSection[] = Array.isArray(script.sections) ? script.sections : []

  const reviewSections: ReviewSection[] = sections.map((sec, i) => {
    const isModified = i % 2 === 0
    const weight = sec.weight ?? Math.round(100 / Math.max(sections.length, 1))
    return {
      name: sec.name,
      // O script real é tratado como a versão "proposta" (v2.1 / IA).
      instructions: sec.instructions,
      tips: sec.tips,
      weight,
      critical: sec.critical ?? false,
      changeType: isModified ? 'modified' : 'unchanged',
      reasoning: isModified ? MOCK_REASONINGS[i % MOCK_REASONINGS.length] : null,
      // "previous" = versão v2.0 sintética, propositalmente mais fraca que
      // o texto real — assim a aba Diff mostra contraste de verdade.
      previous: isModified
        ? MOCK_PREVIOUS[i % MOCK_PREVIOUS.length]
        : null,
      criteria: [],
    }
  })

  // Criteria do script ficam concentrados na 1ª section pra demo — o real
  // mapeamento criteria↔section não existe no schema atual.
  const allCriteria = Array.isArray(script.criteria) ? script.criteria : []
  if (reviewSections.length > 0 && allCriteria.length > 0) {
    reviewSections[0].criteria = allCriteria.map((c, idx) => ({
      name: c.name,
      description: c.description,
      // Última criterion marcada como 'New' pra demonstrar o badge.
      isNew: idx === allCriteria.length - 1,
    }))
  }

  const modifiedCount = reviewSections.filter((s) => s.changeType === 'modified').length

  const changesSummary: ChangeSummaryItem[] = reviewSections
    .filter((s) => s.changeType !== 'unchanged')
    .map((s) => ({
      section: s.name,
      type: s.changeType === 'new' ? 'new' : 'modified',
    }))

  return {
    scriptId: script.id,
    scriptName: script.name,
    baseVersion,
    newVersion: bumpMinor(baseVersion),
    // 47 = número fixo plausível pra demo (igual screenshot de referência).
    callsAnalyzed: 47,
    expectedImpact: modifiedCount,
    sections: reviewSections,
    changesSummary,
    metadata: {
      author: 'Script Intelligence AI',
      date: new Date(script.updated_at ?? script.created_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      sectionsCount: reviewSections.length,
      criteriaCount: allCriteria.length,
    },
  }
}
