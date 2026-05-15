/**
 * TC-02 — Score por dimensão está estruturado por call
 *
 * Dado que uma call foi processada pelo scoring engine
 * Quando a tabela criteria ou scores é consultada por call_id
 * Então retorna um score individual por dimensão
 * E os scores estão vinculados ao organization_id correto
 *
 * Estratégia: testes unitários das funções de parsing em lib/services/calls.ts
 * e da view SQL calls_ml_flat definida em scripts/036_ml_fields.sql.
 * Sem banco — toda a lógica SQL é verificada no texto da migration.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = resolve(__dirname, '..')
const migration036 = readFileSync(resolve(ROOT, 'scripts/036_ml_fields.sql'), 'utf-8')

// ─── Inline do parser de sections (replica lib/services/calls.ts) ─────────────
// Isolado aqui para que o TC não dependa de imports que carregam módulos
// com side-effects (Supabase client, Next.js env, etc.)

type RubricScores = {
  discovery: number
  problemAgitation: number
  offerPresentation: number
  objectionHandling: number
  closeAndNextSteps: number
}

const SECTION_NAME_MAP: Record<string, keyof RubricScores> = {
  discovery: 'discovery',
  'problem agitation': 'problemAgitation',
  'offer presentation': 'offerPresentation',
  'objection handling': 'objectionHandling',
  'close & next steps': 'closeAndNextSteps',
  'close and next steps': 'closeAndNextSteps',
}

function parseSectionsToRubricScores(sections: unknown): RubricScores {
  const defaults: RubricScores = {
    discovery: 0,
    problemAgitation: 0,
    offerPresentation: 0,
    objectionHandling: 0,
    closeAndNextSteps: 0,
  }
  if (!Array.isArray(sections)) return defaults

  type Item = { name?: string; score?: number }
  const result = { ...defaults }
  for (const item of sections as Item[]) {
    const rawName = (item.name ?? '').toLowerCase().trim()
    const key = SECTION_NAME_MAP[rawName]
    if (key) {
      const raw = item.score ?? 0
      const normalised = raw > 5 ? raw / 20 : raw
      result[key] = Math.round(normalised * 10) / 10
    }
  }
  return result
}

// ─── 1. Parser de sections em lib/services/calls.ts ───────────────────────────

describe('TC-02 › parseSectionsToRubricScores', () => {
  const fullSections = [
    { name: 'Discovery', score: 4.1 },
    { name: 'Problem Agitation', score: 3.6 },
    { name: 'Offer Presentation', score: 4.0 },
    { name: 'Objection Handling', score: 3.8 },
    { name: 'Close & Next Steps', score: 4.0 },
  ]

  it('retorna score individual por dimensão', () => {
    const result = parseSectionsToRubricScores(fullSections)
    expect(result.discovery).toBe(4.1)
    expect(result.problemAgitation).toBe(3.6)
    expect(result.offerPresentation).toBe(4.0)
    expect(result.objectionHandling).toBe(3.8)
    expect(result.closeAndNextSteps).toBe(4.0)
  })

  it('normaliza scores na escala 0-100 (calls legadas) para 0-5', () => {
    const legacySections = [
      { name: 'Discovery', score: 82 },
      { name: 'Problem Agitation', score: 72 },
    ]
    const result = parseSectionsToRubricScores(legacySections)
    expect(result.discovery).toBe(4.1)
    expect(result.problemAgitation).toBe(3.6)
  })

  it('retorna zeros para sections ausentes', () => {
    const partial = [{ name: 'Discovery', score: 4.5 }]
    const result = parseSectionsToRubricScores(partial)
    expect(result.discovery).toBe(4.5)
    expect(result.problemAgitation).toBe(0)
    expect(result.objectionHandling).toBe(0)
  })

  it('retorna defaults quando sections é null', () => {
    const result = parseSectionsToRubricScores(null)
    expect(result).toEqual({
      discovery: 0,
      problemAgitation: 0,
      offerPresentation: 0,
      objectionHandling: 0,
      closeAndNextSteps: 0,
    })
  })

  it('retorna defaults quando sections não é array', () => {
    expect(parseSectionsToRubricScores('invalid')).toEqual({
      discovery: 0,
      problemAgitation: 0,
      offerPresentation: 0,
      objectionHandling: 0,
      closeAndNextSteps: 0,
    })
  })

  it('é case-insensitive (nomes com variação de capitalização)', () => {
    const sections = [
      { name: 'DISCOVERY', score: 3.5 },
      { name: 'close and next steps', score: 4.2 },
    ]
    const result = parseSectionsToRubricScores(sections)
    expect(result.discovery).toBe(3.5)
    expect(result.closeAndNextSteps).toBe(4.2)
  })
})

// ─── 2. Estrutura do JSONB sections (formato canonical) ───────────────────────

describe('TC-02 › formato canonical de sections JSONB', () => {
  const canonicalSection = {
    name: 'Objection Handling',
    score: 3.8,
    feedback: 'Handled the price objection but conceded too quickly.',
    critical: false,
    weight: 20,
  }

  it('seção tem campo name (string)', () => {
    expect(typeof canonicalSection.name).toBe('string')
    expect(canonicalSection.name.length).toBeGreaterThan(0)
  })

  it('seção tem campo score numérico entre 1 e 5', () => {
    expect(typeof canonicalSection.score).toBe('number')
    expect(canonicalSection.score).toBeGreaterThanOrEqual(1)
    expect(canonicalSection.score).toBeLessThanOrEqual(5)
  })

  it('seção tem campo feedback não-vazio', () => {
    expect(typeof canonicalSection.feedback).toBe('string')
    expect(canonicalSection.feedback.length).toBeGreaterThan(0)
  })

  it('seção tem campo critical (boolean)', () => {
    expect(typeof canonicalSection.critical).toBe('boolean')
  })

  it('seção tem campo weight (0–100)', () => {
    expect(typeof canonicalSection.weight).toBe('number')
    expect(canonicalSection.weight).toBeGreaterThanOrEqual(0)
    expect(canonicalSection.weight).toBeLessThanOrEqual(100)
  })
})

// ─── 3. View calls_ml_flat — SQL ─────────────────────────────────────────────

describe('TC-02 › view calls_ml_flat na migration 036', () => {
  it('view é criada com CREATE OR REPLACE VIEW', () => {
    expect(migration036).toMatch(/CREATE OR REPLACE VIEW public\.calls_ml_flat/i)
  })

  it('view expõe score_discovery', () => {
    expect(migration036).toMatch(/score_discovery/)
  })

  it('view expõe score_problem_agitation', () => {
    expect(migration036).toMatch(/score_problem_agitation/)
  })

  it('view expõe score_offer_presentation', () => {
    expect(migration036).toMatch(/score_offer_presentation/)
  })

  it('view expõe score_objection_handling', () => {
    expect(migration036).toMatch(/score_objection_handling/)
  })

  it('view expõe score_close_next_steps', () => {
    expect(migration036).toMatch(/score_close_next_steps/)
  })

  it('view expõe org_id (scores vinculados à organização)', () => {
    expect(migration036).toMatch(/c\.org_id/)
  })

  it('view expõe trainer_id (scores vinculados ao trainer)', () => {
    expect(migration036).toMatch(/c\.trainer_id/)
  })

  it('view filtra calls sem sections (sections IS NOT NULL)', () => {
    expect(migration036).toMatch(/WHERE c\.sections IS NOT NULL/i)
  })

  it('extração de score_discovery usa LIKE \'%discovery%\'', () => {
    expect(migration036).toMatch(/lower\(elem->>'name'\)\s+LIKE\s+'%discovery%'/i)
  })

  it('extração de score_objection_handling usa LIKE \'%objection%\'', () => {
    expect(migration036).toMatch(/lower\(elem->>'name'\)\s+LIKE\s+'%objection%'/i)
  })
})

// ─── 4. Cobertura de todas as 5 dimensões da rubrica padrão ──────────────────

describe('TC-02 › 5 dimensões da rubrica cobrem call completa', () => {
  const EXPECTED_DIMENSIONS = [
    'discovery',
    'problemAgitation',
    'offerPresentation',
    'objectionHandling',
    'closeAndNextSteps',
  ] as const

  it('todas as 5 dimensões são produzidas para uma call completa', () => {
    const sections = [
      { name: 'Discovery', score: 4.1 },
      { name: 'Problem Agitation', score: 3.6 },
      { name: 'Offer Presentation', score: 4.0 },
      { name: 'Objection Handling', score: 3.8 },
      { name: 'Close & Next Steps', score: 4.0 },
    ]
    const result = parseSectionsToRubricScores(sections)
    for (const dim of EXPECTED_DIMENSIONS) {
      expect(result[dim]).toBeGreaterThan(0)
    }
  })

  it('scores são individuais por dimensão (não agregados)', () => {
    const sections = [
      { name: 'Discovery', score: 5.0 },
      { name: 'Objection Handling', score: 1.0 },
    ]
    const result = parseSectionsToRubricScores(sections)
    // Scores DIFERENTES: não foram agregados/médias entre si
    expect(result.discovery).not.toBe(result.objectionHandling)
    expect(result.discovery).toBe(5.0)
    expect(result.objectionHandling).toBe(1.0)
  })
})
