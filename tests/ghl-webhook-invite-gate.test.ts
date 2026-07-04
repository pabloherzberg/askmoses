/**
 * TC-GHL-INVITE-GATE — Gate de convite aceito no webhook GHL
 *
 * Regra de negócio: calls do GHL só devem ser inseridas na base E analisadas
 * pela LLM quando o trainer que fez a call estiver DE FATO ativo na
 * plataforma — vinculado (trainers.ghl_user_id) E com convite ACEITO
 * (users.invite_status === 'accepted').
 *
 *   - Sem vínculo nenhum → call ignorada (nada no banco, sem custo de LLM).
 *   - Vinculado mas convite ainda PENDENTE → call ignorada (mesmo tratamento;
 *     antes desta correção, essas calls eram analisadas e salvas normalmente
 *     — só disparava um alerta informativo no Slack, sem bloquear nada).
 *   - Vinculado e convite ACEITO → call segue o fluxo normal.
 *
 * Estratégia: mesmo padrão de tests/tc-llm-config.test.ts — teste de
 * contrato via readFileSync (garante que o gate está no código-fonte da rota
 * real) + lógica de decisão replicada inline como função pura (sem tocar
 * Supabase/Next.js request/response).
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = resolve(__dirname, '..')

const webhookRouteSource = readFileSync(resolve(ROOT, 'app/api/webhooks/ghl/route.ts'), 'utf-8')

// ─── Contrato: o gate está no código-fonte real da rota ─────────────────────

describe('Contrato › app/api/webhooks/ghl/route.ts — gate de vínculo + convite', () => {
  it('ignora call quando trainerLink é null (sem vínculo nenhum)', () => {
    expect(webhookRouteSource).toMatch(/if \(!trainerLink\)/)
    expect(webhookRouteSource).toContain('skipped_unlinked_trainer')
  })

  it('ignora call quando o convite do trainer vinculado NÃO está aceito', () => {
    expect(webhookRouteSource).toMatch(/trainerLink\.inviteStatus\s*!==\s*['"]accepted['"]/)
    expect(webhookRouteSource).toContain('skipped_trainer_invite_pending')
  })

  it('o gate de convite pendente vem ANTES do insert (dbUpsertGhlCall)', () => {
    const inviteGateIdx = webhookRouteSource.indexOf('skipped_trainer_invite_pending')
    const insertIdx = webhookRouteSource.indexOf('dbUpsertGhlCall({')
    expect(inviteGateIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeGreaterThan(-1)
    expect(inviteGateIdx).toBeLessThan(insertIdx)
  })

  it('não sobrou nenhum caminho que insere a call e SÓ loga um alerta pra convite pendente', () => {
    // Antes da correção, existia um bloco pós-insert que só disparava
    // notifyPipelineFailure('trainer_invite_pending', ...) sem bloquear nada.
    // Esse bloco foi removido — o gate agora é o único tratamento do caso.
    expect(webhookRouteSource).not.toContain('notifyPipelineFailure("trainer_invite_pending"')
  })
})

// ─── Lógica de decisão replicada inline (réplica pura, sem I/O) ─────────────

interface TrainerLink {
  trainerId: string
  inviteStatus: string
}

type GateDecision =
  | { action: 'ingest' }
  | { action: 'skip'; reason: 'unlinked_trainer' | 'trainer_invite_pending' }

/** Réplica pura da árvore de decisão do gate em app/api/webhooks/ghl/route.ts. */
function decideIngestGate(trainerLink: TrainerLink | null): GateDecision {
  if (!trainerLink) return { action: 'skip', reason: 'unlinked_trainer' }
  if (trainerLink.inviteStatus !== 'accepted') return { action: 'skip', reason: 'trainer_invite_pending' }
  return { action: 'ingest' }
}

describe('decideIngestGate › réplica pura da árvore de decisão do webhook', () => {
  it('sem vínculo nenhum (trainerLink null) → skip unlinked_trainer', () => {
    expect(decideIngestGate(null)).toEqual({ action: 'skip', reason: 'unlinked_trainer' })
  })

  it('vinculado com convite pending → skip trainer_invite_pending (NÃO ingere, NÃO analisa)', () => {
    expect(decideIngestGate({ trainerId: 't1', inviteStatus: 'pending' })).toEqual({
      action: 'skip',
      reason: 'trainer_invite_pending',
    })
  })

  it('vinculado com qualquer invite_status diferente de accepted → skip (defensivo, não só "pending")', () => {
    expect(decideIngestGate({ trainerId: 't1', inviteStatus: 'revoked' })).toEqual({
      action: 'skip',
      reason: 'trainer_invite_pending',
    })
  })

  it('vinculado e convite accepted → ingest (fluxo normal, é analisada)', () => {
    expect(decideIngestGate({ trainerId: 't1', inviteStatus: 'accepted' })).toEqual({ action: 'ingest' })
  })
})
