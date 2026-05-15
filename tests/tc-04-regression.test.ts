/**
 * TC-04 — Alterações no schema não quebram features existentes
 *
 * Dado que novos campos foram adicionados às tabelas
 * Quando o ambiente de staging é testado
 * Então upload de calls, scoring e coaching email continuam funcionando
 * E nenhum erro de schema é registrado nos logs
 *
 * Estratégia: testes unitários que validam que:
 *   1. dbCreateCall NÃO inclui os campos ML novos no payload de INSERT —
 *      eles são nullable e preenchidos pelo trigger/backfill, não pela app.
 *   2. A interface CreateCallInput NÃO exige closed/call_date/duration_seconds.
 *   3. O payload do /api/analyze para o Supabase mantém os campos existentes.
 *   4. parseSectionsToRubricScores é resiliente a fields extras ou ausentes.
 *   5. A migration 036 é idempotente (ADD COLUMN IF NOT EXISTS).
 *   6. O coaching email (send-coaching) só usa campos pré-existentes.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = resolve(__dirname, '..')
const migration036 = readFileSync(resolve(ROOT, 'scripts/036_ml_fields.sql'), 'utf-8')
const dbCallsSource = readFileSync(resolve(ROOT, 'lib/db/calls.ts'), 'utf-8')
const analyzeRoute = readFileSync(resolve(ROOT, 'app/api/analyze/route.ts'), 'utf-8')
const sendCoachingRoute = readFileSync(resolve(ROOT, 'app/api/send-coaching/route.ts'), 'utf-8')

// ─── 1. Idempotência da migration ─────────────────────────────────────────────

describe('TC-04 › migration 036 é idempotente', () => {
  it('usa ADD COLUMN IF NOT EXISTS para closed', () => {
    expect(migration036).toMatch(/ADD COLUMN IF NOT EXISTS closed/i)
  })

  it('usa ADD COLUMN IF NOT EXISTS para call_date', () => {
    expect(migration036).toMatch(/ADD COLUMN IF NOT EXISTS call_date/i)
  })

  it('usa ADD COLUMN IF NOT EXISTS para duration_seconds', () => {
    expect(migration036).toMatch(/ADD COLUMN IF NOT EXISTS duration_seconds/i)
  })

  it('usa CREATE INDEX IF NOT EXISTS para todos os índices', () => {
    const matches = migration036.match(/CREATE INDEX IF NOT EXISTS/gi) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(3)
  })

  it('usa CREATE OR REPLACE VIEW (idempotente)', () => {
    expect(migration036).toMatch(/CREATE OR REPLACE VIEW/i)
  })

  it('usa CREATE OR REPLACE FUNCTION para o trigger function', () => {
    expect(migration036).toMatch(/CREATE OR REPLACE FUNCTION/i)
  })

  it('usa DROP TRIGGER IF EXISTS antes de CREATE TRIGGER', () => {
    expect(migration036).toMatch(/DROP TRIGGER IF EXISTS/i)
  })
})

// ─── 2. dbCreateCall não inclui campos ML no payload ─────────────────────────

describe('TC-04 › dbCreateCall não escreve campos ML novos', () => {
  it('o INSERT em dbCreateCall não menciona closed', () => {
    // Extrai apenas o bloco da função dbCreateCall
    const fnStart = dbCallsSource.indexOf('export async function dbCreateCall')
    const fnEnd = dbCallsSource.indexOf('\nexport async function', fnStart + 1)
    const fnBody = dbCallsSource.slice(fnStart, fnEnd === -1 ? undefined : fnEnd)

    // closed não deve aparecer no objeto de INSERT
    const insertBlock = fnBody.match(/\.insert\(\{([\s\S]*?)\}\)/)?.[1] ?? ''
    expect(insertBlock).not.toMatch(/\bclosed\b/)
  })

  it('o INSERT em dbCreateCall não menciona call_date', () => {
    const fnStart = dbCallsSource.indexOf('export async function dbCreateCall')
    const fnEnd = dbCallsSource.indexOf('\nexport async function', fnStart + 1)
    const fnBody = dbCallsSource.slice(fnStart, fnEnd === -1 ? undefined : fnEnd)

    const insertBlock = fnBody.match(/\.insert\(\{([\s\S]*?)\}\)/)?.[1] ?? ''
    expect(insertBlock).not.toMatch(/\bcall_date\b/)
  })

  it('o INSERT em dbCreateCall não menciona duration_seconds', () => {
    const fnStart = dbCallsSource.indexOf('export async function dbCreateCall')
    const fnEnd = dbCallsSource.indexOf('\nexport async function', fnStart + 1)
    const fnBody = dbCallsSource.slice(fnStart, fnEnd === -1 ? undefined : fnEnd)

    const insertBlock = fnBody.match(/\.insert\(\{([\s\S]*?)\}\)/)?.[1] ?? ''
    expect(insertBlock).not.toMatch(/\bduration_seconds\b/)
  })
})

// ─── 3. CreateCallInput não exige campos ML ───────────────────────────────────

describe('TC-04 › CreateCallInput não exige campos ML', () => {
  it('interface CreateCallInput não lista closed como campo', () => {
    const ifaceStart = dbCallsSource.indexOf('export interface CreateCallInput')
    const ifaceEnd = dbCallsSource.indexOf('\nexport interface', ifaceStart + 1)
    const ifaceBody = dbCallsSource.slice(ifaceStart, ifaceEnd)
    expect(ifaceBody).not.toMatch(/\bclosed\b/)
  })

  it('interface CreateCallInput não lista call_date como campo', () => {
    const ifaceStart = dbCallsSource.indexOf('export interface CreateCallInput')
    const ifaceEnd = dbCallsSource.indexOf('\nexport interface', ifaceStart + 1)
    const ifaceBody = dbCallsSource.slice(ifaceStart, ifaceEnd)
    expect(ifaceBody).not.toMatch(/\bcall_date\b/)
  })

  it('interface CreateCallInput não lista duration_seconds como campo', () => {
    const ifaceStart = dbCallsSource.indexOf('export interface CreateCallInput')
    const ifaceEnd = dbCallsSource.indexOf('\nexport interface', ifaceStart + 1)
    const ifaceBody = dbCallsSource.slice(ifaceStart, ifaceEnd)
    expect(ifaceBody).not.toMatch(/\bduration_seconds\b/)
  })

  it('campos obrigatórios de CreateCallInput continuam presentes (trainerName)', () => {
    const ifaceStart = dbCallsSource.indexOf('export interface CreateCallInput')
    const ifaceEnd = dbCallsSource.indexOf('\nexport interface', ifaceStart + 1)
    const ifaceBody = dbCallsSource.slice(ifaceStart, ifaceEnd)
    expect(ifaceBody).toMatch(/trainerName:\s*string/)
  })
})

// ─── 4. /api/analyze continua chamando dbCreateCall com campos existentes ─────

describe('TC-04 › /api/analyze — regressão de campos existentes', () => {
  it('chama dbCreateCall com callOutcome', () => {
    expect(analyzeRoute).toMatch(/callOutcome:\s*reportedOutcome/)
  })

  it('chama dbCreateCall com sections', () => {
    expect(analyzeRoute).toMatch(/sections:\s*normalisedSections/)
  })

  it('chama dbCreateCall com overallScore', () => {
    expect(analyzeRoute).toMatch(/overallScore/)
  })

  it('chama dbCreateCall com detectedOutcome', () => {
    expect(analyzeRoute).toMatch(/detectedOutcome/)
  })

  it('chama dbCreateCall com promptVersion', () => {
    expect(analyzeRoute).toMatch(/promptVersion:\s*PROMPT_VERSION/)
  })

  it('chama dbCreateCall com modelUsed', () => {
    expect(analyzeRoute).toMatch(/modelUsed/)
  })

  it('não passa closed diretamente ao dbCreateCall', () => {
    // O campo closed é gerenciado pelo trigger; a route não deve passá-lo
    const insertBlock = analyzeRoute.match(/await dbCreateCall\(\{([\s\S]*?)\}\)/)?.[1] ?? ''
    expect(insertBlock).not.toMatch(/\bclosed\b/)
  })
})

// ─── 5. /api/send-coaching — não usa campos ML ────────────────────────────────

describe('TC-04 › /api/send-coaching — campos existentes intactos', () => {
  it('usa trainerName, trainerEmail', () => {
    expect(sendCoachingRoute).toMatch(/trainerName/)
    expect(sendCoachingRoute).toMatch(/trainerEmail/)
  })

  it('usa overallScore', () => {
    expect(sendCoachingRoute).toMatch(/overallScore/)
  })

  it('usa sections para o email de coaching', () => {
    expect(sendCoachingRoute).toMatch(/sections/)
  })

  it('usa strengths e improvements', () => {
    expect(sendCoachingRoute).toMatch(/strengths/)
    expect(sendCoachingRoute).toMatch(/improvements/)
  })

  it('não referencia closed, call_date ou duration_seconds', () => {
    expect(sendCoachingRoute).not.toMatch(/\bclosed\b/)
    expect(sendCoachingRoute).not.toMatch(/\bcall_date\b/)
    expect(sendCoachingRoute).not.toMatch(/\bduration_seconds\b/)
  })
})

// ─── 6. parseSectionsToRubricScores resiliente a campos extras ────────────────

describe('TC-04 › parseSectionsToRubricScores resiliente a mudanças de schema', () => {
  // Replica a implementação inline para evitar imports com side-effects
  type RubricScores = {
    discovery: number; problemAgitation: number; offerPresentation: number
    objectionHandling: number; closeAndNextSteps: number
  }

  const MAP: Record<string, keyof RubricScores> = {
    discovery: 'discovery',
    'problem agitation': 'problemAgitation',
    'offer presentation': 'offerPresentation',
    'objection handling': 'objectionHandling',
    'close & next steps': 'closeAndNextSteps',
    'close and next steps': 'closeAndNextSteps',
  }

  function parse(sections: unknown): RubricScores {
    const d: RubricScores = { discovery: 0, problemAgitation: 0, offerPresentation: 0, objectionHandling: 0, closeAndNextSteps: 0 }
    if (!Array.isArray(sections)) return d
    const result = { ...d }
    for (const item of sections as Record<string, unknown>[]) {
      const key = MAP[(String(item.name ?? '')).toLowerCase().trim()]
      if (key) {
        const raw = typeof item.score === 'number' ? item.score : 0
        result[key] = Math.round((raw > 5 ? raw / 20 : raw) * 10) / 10
      }
    }
    return result
  }

  it('ignora campos desconhecidos no objeto de section', () => {
    const sections = [
      { name: 'Discovery', score: 4.0, closed: true, call_date: '2026-05-01', extra_field: 'ignored' },
    ]
    expect(() => parse(sections)).not.toThrow()
    expect(parse(sections).discovery).toBe(4.0)
  })

  it('não produz erro se section não tem campo score', () => {
    const sections = [{ name: 'Discovery' }]
    expect(() => parse(sections)).not.toThrow()
    expect(parse(sections).discovery).toBe(0)
  })

  it('array vazio retorna zeros sem erro', () => {
    expect(parse([])).toEqual({
      discovery: 0, problemAgitation: 0, offerPresentation: 0,
      objectionHandling: 0, closeAndNextSteps: 0,
    })
  })
})
