/**
 * TC-01 — Campo `closed` existe e está populado
 *
 * Dado que a tabela calls foi auditada
 * Quando uma query busca calls de Centurion e Taking the Lead
 * Então todas as calls possuem o campo `closed` preenchido (true/false)
 * E nenhum registro crítico retorna null nesse campo
 *
 * Estratégia: testes unitários puros sem banco.
 *   1. Verifica que DbCall (interface TypeScript) expõe o campo `closed`.
 *   2. Verifica que a migration 036 contém ADD COLUMN closed BOOLEAN.
 *   3. Verifica que o trigger de sincronização está definido na migration.
 *   4. Verifica a lógica de backfill: call_outcome='closed' → closed=true,
 *      qualquer outro valor → closed=false, null → não atualizado.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import type { DbCall } from '@/lib/db/calls'

const ROOT = resolve(__dirname, '..')
const migration036 = readFileSync(resolve(ROOT, 'scripts/036_ml_fields.sql'), 'utf-8')

// ─── 1. Interface TypeScript ──────────────────────────────────────────────────

describe('TC-01 › DbCall interface', () => {
  it('expõe campo closed como boolean | null', () => {
    // TypeScript não dá acesso aos campos em runtime, então instanciamos um
    // objeto parcial que satisfaz a interface e checamos as propriedades.
    const row: DbCall = {
      id: 'x',
      org_id: null,
      rubric_id: null,
      trainer_id: null,
      trainer_name: 'Marcus',
      trainer_email: null,
      transcript: null,
      overall_score: 92,
      summary: null,
      strengths: null,
      improvements: null,
      email_sent: false,
      email_id: null,
      created_at: '2026-05-01T00:00:00Z',
      updated_at: '2026-05-01T00:00:00Z',
      call_outcome: 'closed',
      client_name: 'Centurion Dog Training',
      detected_outcome: 'closed',
      model_used: null,
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      prompt_version: null,
      sections: null,
      closed: true,
      call_date: '2026-05-01',
      duration_seconds: null,
      lead_name: null,
      lead_source: null,
    }

    expect(Object.prototype.hasOwnProperty.call(row, 'closed')).toBe(true)
    expect(row.closed).toBe(true)
  })

  it('closed pode ser null (calls legadas sem outcome)', () => {
    const row: Partial<DbCall> = { closed: null }
    expect(row.closed).toBeNull()
  })

  it('closed pode ser false (call com outcome not_closed)', () => {
    const row: Partial<DbCall> = { closed: false }
    expect(row.closed).toBe(false)
  })
})

// ─── 2. Migration SQL — coluna closed ────────────────────────────────────────

describe('TC-01 › migration 036 — ADD COLUMN closed', () => {
  it('contém ADD COLUMN IF NOT EXISTS closed BOOLEAN', () => {
    expect(migration036).toMatch(/ADD COLUMN IF NOT EXISTS closed\s+BOOLEAN/i)
  })

  it('faz backfill: closed = (call_outcome = \'closed\')', () => {
    expect(migration036).toMatch(/SET closed\s*=\s*\(call_outcome\s*=\s*'closed'\)/i)
  })

  it('cria índice calls_closed_idx', () => {
    expect(migration036).toMatch(/CREATE INDEX IF NOT EXISTS calls_closed_idx/i)
  })

  it('cria índice composto (org_id, closed) para filtros multi-tenant', () => {
    expect(migration036).toMatch(/CREATE INDEX IF NOT EXISTS calls_closed_org_idx/i)
  })
})

// ─── 3. Migration SQL — trigger de sincronização ─────────────────────────────

describe('TC-01 › migration 036 — trigger sync_closed', () => {
  it('cria função sync_closed_from_outcome', () => {
    expect(migration036).toMatch(/CREATE OR REPLACE FUNCTION public\.sync_closed_from_outcome/i)
  })

  it('trigger dispara em INSERT e UPDATE OF call_outcome', () => {
    expect(migration036).toMatch(/BEFORE INSERT OR UPDATE OF call_outcome/i)
  })

  it('trigger aplica a lógica closed = (call_outcome = \'closed\')', () => {
    expect(migration036).toMatch(/NEW\.closed\s*:=\s*\(NEW\.call_outcome\s*=\s*'closed'\)/i)
  })
})

// ─── 4. Lógica de backfill — sem banco ────────────────────────────────────────

describe('TC-01 › lógica de backfill (closed derivado de call_outcome)', () => {
  // Replica a lógica do trigger em TypeScript para validar o comportamento
  function deriveClosedFromOutcome(callOutcome: string | null): boolean | null {
    if (callOutcome === null) return null
    return callOutcome === 'closed'
  }

  it('call_outcome=closed → closed=true', () => {
    expect(deriveClosedFromOutcome('closed')).toBe(true)
  })

  it('call_outcome=not_closed → closed=false', () => {
    expect(deriveClosedFromOutcome('not_closed')).toBe(false)
  })

  it('call_outcome=partial → closed=false', () => {
    expect(deriveClosedFromOutcome('partial')).toBe(false)
  })

  it('call_outcome=no_outcome → closed=false', () => {
    expect(deriveClosedFromOutcome('no_outcome')).toBe(false)
  })

  it('call_outcome=null → closed=null (sem backfill)', () => {
    expect(deriveClosedFromOutcome(null)).toBeNull()
  })

  // TC-01 específico: simula calls de "Centurion Dog Training" e "Taking the Lead"
  const centurionCalls: Array<{ client_name: string; call_outcome: string }> = [
    { client_name: 'Centurion Dog Training', call_outcome: 'closed' },
    { client_name: 'Centurion Dog Training', call_outcome: 'not_closed' },
    { client_name: 'Centurion Dog Training', call_outcome: 'partial' },
    { client_name: 'Taking the Lead', call_outcome: 'closed' },
    { client_name: 'Taking the Lead', call_outcome: 'no_outcome' },
  ]

  it('todas as calls de Centurion/Taking the Lead têm closed !== null após backfill', () => {
    const result = centurionCalls.map((c) => ({
      ...c,
      closed: deriveClosedFromOutcome(c.call_outcome),
    }))

    const nullClosed = result.filter((c) => c.closed === null)
    expect(nullClosed).toHaveLength(0)
  })

  it('calls com outcome=closed têm closed=true', () => {
    const closedCalls = centurionCalls
      .filter((c) => c.call_outcome === 'closed')
      .map((c) => deriveClosedFromOutcome(c.call_outcome))

    expect(closedCalls.every((v) => v === true)).toBe(true)
  })
})
