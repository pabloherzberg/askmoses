/**
 * TC-Lead Enrichment — lead_name e lead_source no payload do webhook GHL/Pepper CRM
 *
 * TC-01 — Payload completo é processado corretamente
 * TC-02 — Payload sem os campos novos é aceito sem erro
 * TC-03 — lead_source com valor não mapeado é salvo como other
 * TC-04 — String vazia é tratada como null
 * TC-05 — lead_name exibido no detalhe da call
 * TC-06 — lead_source disponível como filtro no histórico
 * TC-07 — Calls antigas não quebram após a mudança
 *
 * Estratégia: testes unitários puros (sem banco, sem rede).
 *   - Valida a interface DbCall expõe lead_name e lead_source.
 *   - Valida que CreateCallInput aceita leadName e leadSource como opcionais.
 *   - Valida a lógica de normalização do analyze route (string vazia → null,
 *     valor não mapeado → 'other', valores válidos passam intactos).
 *   - Valida que o tipo Call aceita lead_name e lead_source opcionais.
 *   - Valida que mock calls têm distribuição correta de lead_source.
 *   - Valida o comportamento do filtro lead_source sobre arrays de Call.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { DbCall, CreateCallInput } from '@/lib/db/calls'
import type { Call, LeadSource } from '@/lib/types'
import { LEAD_SOURCES, LEAD_SOURCE_LABELS } from '@/lib/constants'
import { calls } from '@/lib/mock-data'

const ROOT = resolve(__dirname, '..')
const analyzeRouteSource = readFileSync(resolve(ROOT, 'app/api/analyze/route.ts'), 'utf-8')
const dbCallsSource      = readFileSync(resolve(ROOT, 'lib/db/calls.ts'), 'utf-8')
const servicesSource     = readFileSync(resolve(ROOT, 'lib/services/calls.ts'), 'utf-8')
const callDetailSource   = readFileSync(resolve(ROOT, 'components/shared/CallDetail.tsx'), 'utf-8')
const callsTableSource   = readFileSync(resolve(ROOT, 'app/[locale]/calls/CallsTable.tsx'), 'utf-8')

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Replica a lógica de normalização do analyze route (sem importar o módulo inteiro). */
function normaliseLeadName(raw: string | null | undefined): string | null {
  return raw?.trim() || null
}

const VALID_SOURCES = new Set(LEAD_SOURCES.map((s) => s.value))

function normaliseLeadSource(raw: string | null | undefined): LeadSource | null {
  const v = raw?.trim().toLowerCase() || null
  if (!v) return null
  return VALID_SOURCES.has(v) ? (v as LeadSource) : 'other'
}

/** Replica o filtro de lead_source do CallsTable. */
function filterBySource(list: Call[], sourceFilter: string): Call[] {
  if (sourceFilter === 'all') return list
  return list.filter((c) => (c.lead_source ?? null) === sourceFilter)
}

// ─── TC-01: Payload completo ──────────────────────────────────────────────────

describe('TC-01 › Payload completo é processado corretamente', () => {
  it('lead_name e lead_source são aceitos no AnalyzeRequestBody (interface)', () => {
    expect(analyzeRouteSource).toMatch(/lead_name\?\s*:\s*string\s*\|\s*null/)
    expect(analyzeRouteSource).toMatch(/lead_source\?\s*:\s*string\s*\|\s*null/)
  })

  it('normalise preserva lead_name válido sem alteração', () => {
    expect(normaliseLeadName('John Martinez')).toBe('John Martinez')
  })

  it('normalise preserva lead_source facebook', () => {
    expect(normaliseLeadSource('facebook')).toBe('facebook')
  })

  it('normalise preserva lead_source google', () => {
    expect(normaliseLeadSource('google')).toBe('google')
  })

  it('normalise preserva lead_source organic', () => {
    expect(normaliseLeadSource('organic')).toBe('organic')
  })

  it('normalise preserva lead_source referral', () => {
    expect(normaliseLeadSource('referral')).toBe('referral')
  })

  it('normalise preserva lead_source other', () => {
    expect(normaliseLeadSource('other')).toBe('other')
  })

  it('leadName e leadSource são passados para dbCreateCall', () => {
    expect(analyzeRouteSource).toMatch(/leadName\s*:\s*rawLeadName/)
    expect(analyzeRouteSource).toMatch(/leadSource\s*:\s*normalisedLeadSource/)
  })

  it('DbCall expõe lead_name como string | null', () => {
    const row: DbCall = {
      id: 'tc01',
      rubric_id: null,
      trainer_id: null,
      trainer_name: 'Marcus R.',
      trainer_email: null,
      transcript: null,
      overall_score: 94,
      summary: null,
      strengths: null,
      improvements: null,
      email_sent: false,
      email_id: null,
      created_at: '2026-03-22T10:00:00Z',
      updated_at: '2026-03-22T10:00:00Z',
      call_outcome: 'closed',
      client_name: 'Bob W.',
      detected_outcome: 'closed',
      model_used: null,
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      prompt_version: null,
      sections: null,
      closed: true,
      call_date: '2026-03-22',
      duration_seconds: null,
      lead_name: 'Robert Williams',
      lead_source: 'facebook',
    }
    expect(row.lead_name).toBe('Robert Williams')
    expect(row.lead_source).toBe('facebook')
  })
})

// ─── TC-02: Payload sem os novos campos ───────────────────────────────────────

describe('TC-02 › Payload sem os campos novos é aceito sem erro', () => {
  it('CreateCallInput NÃO exige leadName (campo opcional)', () => {
    // Se o campo fosse obrigatório, o TypeScript emitiria erro em compile time.
    // Aqui verificamos via source que está marcado com "?"
    expect(dbCallsSource).toMatch(/leadName\?\s*:\s*string\s*\|\s*null/)
    expect(dbCallsSource).toMatch(/leadSource\?\s*:\s*string\s*\|\s*null/)
  })

  it('normalise retorna null quando lead_name é undefined', () => {
    expect(normaliseLeadName(undefined)).toBeNull()
  })

  it('normalise retorna null quando lead_source é undefined', () => {
    expect(normaliseLeadSource(undefined)).toBeNull()
  })

  it('Call aceita lead_name e lead_source como opcionais (tipo)', () => {
    const call: Call = {
      id: 'tc02',
      trainerId: 'trainer-1',
      trainerName: 'Jamie L.',
      date: '2026-03-21',
      durationSeconds: 2100,
      score: 4.5,
      result: 'closed',
      prospect: 'Diana M.',
      rubricScores: { discovery: 4.5, problemAgitation: 4.5, offerPresentation: 4.4, objectionHandling: 4.2, closeAndNextSteps: 4.3 },
      feedback: 'Good call.',
      strengths: [],
      improvements: [],
      transcript: '...',
      // lead_name e lead_source intencionalmente omitidos
    }
    // Se o tipo exigisse os campos, TypeScript reclamaria acima.
    expect(call.lead_name).toBeUndefined()
    expect(call.lead_source).toBeUndefined()
  })

  it('dbCreateCall persiste null quando leadName não é fornecido', () => {
    expect(dbCallsSource).toMatch(/lead_name\s*:\s*input\.leadName\s*\?\?\s*null/)
  })

  it('dbCreateCall persiste null quando leadSource não é fornecido', () => {
    expect(dbCallsSource).toMatch(/lead_source\s*:\s*input\.leadSource\s*\?\?\s*null/)
  })
})

// ─── TC-03: lead_source com valor não mapeado → other ────────────────────────

describe('TC-03 › lead_source com valor não mapeado é salvo como other', () => {
  it('tiktok → other', () => {
    expect(normaliseLeadSource('tiktok')).toBe('other')
  })

  it('instagram → other', () => {
    expect(normaliseLeadSource('instagram')).toBe('other')
  })

  it('youtube → other', () => {
    expect(normaliseLeadSource('youtube')).toBe('other')
  })

  it('FACEBOOK (maiúsculo) → facebook', () => {
    expect(normaliseLeadSource('FACEBOOK')).toBe('facebook')
  })

  it('  google  (com espaços) → google', () => {
    expect(normaliseLeadSource('  google  ')).toBe('google')
  })

  it('lógica de fallback para other está no analyze route', () => {
    expect(analyzeRouteSource).toMatch(/validSourceValues\.has\(rawLeadSource\)/)
    expect(analyzeRouteSource).toMatch(/'other'/)
  })

  it('lógica de fallback para other está no services/calls.ts (toCall)', () => {
    expect(servicesSource).toMatch(/parseLeadSource/)
    expect(servicesSource).toMatch(/'other'/)
  })
})

// ─── TC-04: String vazia → null ───────────────────────────────────────────────

describe('TC-04 › String vazia é tratada como null', () => {
  it('lead_name "" → null', () => {
    expect(normaliseLeadName('')).toBeNull()
  })

  it('lead_source "" → null', () => {
    expect(normaliseLeadSource('')).toBeNull()
  })

  it('lead_name "   " (só espaços) → null', () => {
    expect(normaliseLeadName('   ')).toBeNull()
  })

  it('lead_source "   " (só espaços) → null', () => {
    expect(normaliseLeadSource('   ')).toBeNull()
  })

  it('lógica de string vazia → null no analyze route (rawLeadName)', () => {
    expect(analyzeRouteSource).toMatch(/body\.lead_name\?\.trim\(\)\s*\|\|\s*null/)
  })

  it('lógica de string vazia → null no analyze route (rawLeadSource)', () => {
    expect(analyzeRouteSource).toMatch(/body\.lead_source\?\.trim\(\).*\|\|\s*null/)
  })

  it('lógica de string vazia → null no services/calls.ts (toCall)', () => {
    // parseLeadSource retorna null para raw vazio/null
    expect(servicesSource).toMatch(/if\s*\(!raw.*\|\|.*trim.*===.*''\s*\)\s*return null/)
  })

  it('mock calls com lead_name null existem (simula calls sem enrichment)', () => {
    const nullLeadNameCalls = calls.filter((c) => c.lead_name === null)
    expect(nullLeadNameCalls.length).toBeGreaterThan(0)
  })

  it('mock calls com lead_source null existem (simula calls antigas)', () => {
    const nullSourceCalls = calls.filter((c) => c.lead_source === null)
    expect(nullSourceCalls.length).toBeGreaterThan(0)
  })
})

// ─── TC-05: lead_name exibido no detalhe da call ──────────────────────────────

describe('TC-05 › lead_name exibido no detalhe da call', () => {
  it('CallDetail renderiza lead_name quando presente', () => {
    expect(callDetailSource).toMatch(/call\.lead_name/)
  })

  it('CallDetail usa lead_name da chave de tradução leadName', () => {
    expect(callDetailSource).toMatch(/t\('leadName'\)/)
  })

  it('bloco de lead é condicional (oculto quando null)', () => {
    expect(callDetailSource).toMatch(/call\.lead_name\s*\|\|\s*call\.lead_source/)
  })

  it('mock call 601 tem lead_name "Robert Williams"', () => {
    const call = calls.find((c) => c.id === '00000000-0000-0000-0000-000000000601')
    expect(call?.lead_name).toBe('Robert Williams')
  })

  it('mock calls sem lead_name retornam undefined ou null (não quebram)', () => {
    const nullLeadCalls = calls.filter((c) => !c.lead_name)
    expect(nullLeadCalls.length).toBeGreaterThan(0)
    for (const call of nullLeadCalls) {
      expect(call.lead_name == null).toBe(true)
    }
  })
})

// ─── TC-06: lead_source como filtro no histórico ──────────────────────────────

describe('TC-06 › lead_source disponível como filtro no histórico', () => {
  it('CallsTable tem select de sourceFilter', () => {
    expect(callsTableSource).toMatch(/sourceFilter/)
  })

  it('CallsTable importa LEAD_SOURCES e LEAD_SOURCE_LABELS', () => {
    expect(callsTableSource).toMatch(/LEAD_SOURCES/)
    expect(callsTableSource).toMatch(/LEAD_SOURCE_LABELS/)
  })

  it('filtro "facebook" retorna apenas calls com lead_source facebook', () => {
    const filtered = filterBySource(calls, 'facebook')
    expect(filtered.length).toBeGreaterThan(0)
    for (const c of filtered) {
      expect(c.lead_source).toBe('facebook')
    }
  })

  it('filtro "google" retorna apenas calls com lead_source google', () => {
    const filtered = filterBySource(calls, 'google')
    expect(filtered.length).toBeGreaterThan(0)
    for (const c of filtered) {
      expect(c.lead_source).toBe('google')
    }
  })

  it('filtro "organic" retorna apenas calls com lead_source organic', () => {
    const filtered = filterBySource(calls, 'organic')
    expect(filtered.length).toBeGreaterThan(0)
    for (const c of filtered) {
      expect(c.lead_source).toBe('organic')
    }
  })

  it('filtro "referral" retorna apenas calls com lead_source referral', () => {
    const filtered = filterBySource(calls, 'referral')
    expect(filtered.length).toBeGreaterThan(0)
    for (const c of filtered) {
      expect(c.lead_source).toBe('referral')
    }
  })

  it('filtro "other" retorna apenas calls com lead_source other', () => {
    const filtered = filterBySource(calls, 'other')
    expect(filtered.length).toBeGreaterThan(0)
    for (const c of filtered) {
      expect(c.lead_source).toBe('other')
    }
  })

  it('filtro "all" retorna todas as calls sem filtrar', () => {
    const filtered = filterBySource(calls, 'all')
    expect(filtered.length).toBe(calls.length)
  })

  it('contador reflete o filtro: facebook < total', () => {
    const total = calls.length
    const facebookCount = filterBySource(calls, 'facebook').length
    expect(facebookCount).toBeGreaterThan(0)
    expect(facebookCount).toBeLessThan(total)
  })

  it('LEAD_SOURCES contém os 5 valores esperados', () => {
    const values = LEAD_SOURCES.map((s) => s.value)
    expect(values).toContain('facebook')
    expect(values).toContain('google')
    expect(values).toContain('organic')
    expect(values).toContain('referral')
    expect(values).toContain('other')
    expect(values).toHaveLength(5)
  })

  it('LEAD_SOURCE_LABELS tem label para cada valor de LeadSource', () => {
    expect(LEAD_SOURCE_LABELS.facebook).toBe('Facebook')
    expect(LEAD_SOURCE_LABELS.google).toBe('Google')
    expect(LEAD_SOURCE_LABELS.organic).toBe('Organic')
    expect(LEAD_SOURCE_LABELS.referral).toBe('Referral')
    expect(LEAD_SOURCE_LABELS.other).toBe('Other')
  })
})

// ─── TC-07: Calls antigas não quebram ────────────────────────────────────────

describe('TC-07 › Calls antigas sem lead_name/lead_source não quebram a interface', () => {
  it('mock calls com lead_name null existem e têm os demais campos intactos', () => {
    const legacyCalls = calls.filter((c) => c.lead_name === null)
    expect(legacyCalls.length).toBeGreaterThan(0)
    for (const call of legacyCalls) {
      expect(call.id).toBeDefined()
      expect(call.trainerName).toBeDefined()
      expect(call.prospect).toBeDefined()
      expect(call.score).toBeTypeOf('number')
      expect(['closed', 'not_closed', 'partial', 'no_outcome']).toContain(call.result)
    }
  })

  it('mock calls com lead_source null existem e têm os demais campos intactos', () => {
    const legacyCalls = calls.filter((c) => c.lead_source === null)
    expect(legacyCalls.length).toBeGreaterThan(0)
    for (const call of legacyCalls) {
      expect(call.rubricScores).toBeDefined()
      expect(call.strengths).toBeInstanceOf(Array)
      expect(call.improvements).toBeInstanceOf(Array)
    }
  })

  it('filtro "all" retorna calls antigas junto com as novas sem erro', () => {
    const all = filterBySource(calls, 'all')
    const legacyInAll = all.filter((c) => c.lead_source === null)
    expect(legacyInAll.length).toBeGreaterThan(0)
  })

  it('parseLeadSource em services/calls.ts trata null como null', () => {
    expect(servicesSource).toMatch(/if\s*\(!raw.*\)\s*return null/)
  })

  it('Call type define lead_name como opcional (não quebra calls sem o campo)', () => {
    // Verificado via TypeScript: o campo é "?" então pode ser omitido
    const legacyCall: Call = {
      id: 'legacy-001',
      trainerId: 'trainer-x',
      trainerName: 'Old Trainer',
      date: '2025-01-01',
      durationSeconds: 1200,
      score: 3.5,
      result: 'no_outcome',
      prospect: 'Old Prospect',
      rubricScores: { discovery: 3.5, problemAgitation: 3.0, offerPresentation: 3.5, objectionHandling: 3.0, closeAndNextSteps: 3.0 },
      feedback: 'Old feedback',
      strengths: [],
      improvements: [],
      transcript: 'Old transcript',
      // lead_name e lead_source intencionalmente omitidos (simulando call antiga)
    }
    expect(legacyCall.lead_name).toBeUndefined()
    expect(legacyCall.lead_source).toBeUndefined()
  })

  it('supabaseCalls mapeado inclui lead_name e lead_source para calls com e sem o campo', () => {
    // supabaseCalls deve ter o mesmo número de entradas que calls
    // e cada entrada deve ter lead_name/lead_source (mesmo que null)
    // Verificamos via fonte do mock-data
    const mockSource = readFileSync(resolve(ROOT, 'lib/mock-data.ts'), 'utf-8')
    expect(mockSource).toMatch(/lead_name\s*:\s*call\.lead_name\s*\?\?\s*null/)
    expect(mockSource).toMatch(/lead_source\s*:\s*call\.lead_source\s*\?\?\s*null/)
  })
})
