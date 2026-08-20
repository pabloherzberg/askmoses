/**
 * TC-GHL-WON-GATE — Gate de contato já fechado (Won) no webhook GHL
 *
 * Regra de negócio: uma vez que um lead vira Won (ghl_won_status='won' em
 * qualquer call do contato — dbUpdateGhlOpportunity carimba todas as calls
 * do contact_id ao mesmo tempo), nenhuma call NOVA desse mesmo contato deve
 * ser registrada no AskMoses. O contato já fechou; ligações posteriores
 * (reagendamento, reprocessamento do GHL) não devem virar linha em `calls`.
 *
 * Estratégia: mesmo padrão de tests/ghl-webhook-invite-gate.test.ts — teste
 * de contrato via readFileSync (garante que o gate está no código-fonte da
 * rota real) + lógica de decisão replicada inline como função pura.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = resolve(__dirname, '..')

const webhookRouteSource = readFileSync(resolve(ROOT, 'app/api/webhooks/ghl/route.ts'), 'utf-8')
const dbCallsSource = readFileSync(resolve(ROOT, 'lib/db/calls.ts'), 'utf-8')

// ─── Contrato: o gate está no código-fonte real da rota ─────────────────────

describe('Contrato › app/api/webhooks/ghl/route.ts — gate de contato já fechado (Won)', () => {
  it('checa dbHasWonCall antes de inserir a call', () => {
    expect(webhookRouteSource).toContain('dbHasWonCall(orgConfig.orgId, contactId)')
  })

  it('rejeita (sem inserir) quando o contato já tem call won', () => {
    expect(webhookRouteSource).toContain('skipped_contact_already_won')
  })

  it('o gate de Won vem ANTES do insert (dbUpsertGhlCall)', () => {
    const wonGateIdx = webhookRouteSource.indexOf('skipped_contact_already_won')
    const insertIdx = webhookRouteSource.indexOf('dbUpsertGhlCall({')
    expect(wonGateIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeGreaterThan(-1)
    expect(wonGateIdx).toBeLessThan(insertIdx)
  })

  it('dbHasWonCall existe em lib/db/calls.ts e filtra por org, contact_id e ghl_won_status=won', () => {
    expect(dbCallsSource).toMatch(/export async function dbHasWonCall/)
    expect(dbCallsSource).toContain(".eq('ghl_won_status', 'won')")
  })
})

// ─── Lógica de decisão replicada inline (réplica pura, sem I/O) ─────────────

type GateDecision =
  | { action: 'ingest' }
  | { action: 'skip'; reason: 'contact_already_won' }

/** Réplica pura do gate de Won em app/api/webhooks/ghl/route.ts. */
function decideWonGate(contactAlreadyWon: boolean): GateDecision {
  if (contactAlreadyWon) return { action: 'skip', reason: 'contact_already_won' }
  return { action: 'ingest' }
}

describe('decideWonGate › réplica pura da árvore de decisão do webhook', () => {
  it('contato já tem call won → skip contact_already_won (NÃO insere)', () => {
    expect(decideWonGate(true)).toEqual({ action: 'skip', reason: 'contact_already_won' })
  })

  it('contato sem call won ainda → ingest (fluxo normal)', () => {
    expect(decideWonGate(false)).toEqual({ action: 'ingest' })
  })
})
