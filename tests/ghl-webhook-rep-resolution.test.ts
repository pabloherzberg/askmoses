/**
 * TC-GHL-REP-RESOLUTION — Resolução do rep no webhook GHL (Front Desk)
 *
 * Substitui o antigo TC-GHL-INVITE-GATE, que travava o comportamento oposto.
 *
 * Regra de negócio ATUAL: nenhuma call do GHL é descartada por causa de quem a
 * fez. Ela SEMPRE entra, é transcrita e pontuada.
 *
 *   - Sem vínculo (ou payload sem userId) → vai pro FRONT DESK da org (rep de
 *     sistema, migration 109). Na operação do cliente o Front Desk é a
 *     recepção: telefone compartilhado, quem está mais perto atende. É
 *     atribuição PROVISÓRIA — vinculado o rep real, a call migra pra ele
 *     (reassignFrontDeskCalls).
 *   - Vinculado com convite PENDENTE → vai pro rep REAL (ele é conhecido!) e a
 *     pendência sai como alerta informativo DEPOIS do insert.
 *   - Vinculado e ACEITO → fluxo normal.
 *
 * Por que o descarte saiu: o gate antigo (55a8f3b, 02/07) devolvia 200 sem
 * gravar nada e sem alertar — 150+ calls perdidas em 7 orgs em 4 dias, e uma
 * cliente abriu ticket por ver a lacuna sem explicação e concluir que inbound
 * não era processado. A invisibilidade era o bug.
 *
 * Estratégia: mesmo padrão de tests/tc-llm-config.test.ts — teste de contrato
 * via readFileSync (garante que a regra está no fonte da rota real) + a árvore
 * de decisão replicada inline como função pura.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import { FRONT_DESK_NAME } from '@/lib/constants/front-desk'

const ROOT = resolve(__dirname, '..')

const webhookRouteSource = readFileSync(resolve(ROOT, 'app/api/webhooks/ghl/route.ts'), 'utf-8')

// ─── Contrato: a regra está no código-fonte real da rota ────────────────────

describe('Contrato › app/api/webhooks/ghl/route.ts — resolução do rep', () => {
  it('não existe mais nenhum caminho que descarte a call por causa do rep', () => {
    expect(webhookRouteSource).not.toContain('skipped_unlinked_trainer')
    expect(webhookRouteSource).not.toContain('skipped_trainer_invite_pending')
  })

  it('sem vínculo → resolve o Front Desk da org', () => {
    expect(webhookRouteSource).toContain('dbGetOrCreateFrontDeskTrainer')
    expect(webhookRouteSource).toMatch(/isFrontDesk:\s*true/)
  })

  it('o Front Desk é resolvido ANTES do insert — a call é persistida com trainer_id', () => {
    const frontDeskIdx = webhookRouteSource.indexOf('dbGetOrCreateFrontDeskTrainer(orgConfig.orgId)')
    const insertIdx = webhookRouteSource.indexOf('dbUpsertGhlCall({')
    expect(frontDeskIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeGreaterThan(-1)
    expect(frontDeskIdx).toBeLessThan(insertIdx)
  })

  it('os dois cortes de custo vêm ANTES de provisionar o Front Desk', () => {
    // Call confirmadamente curta (<30s) e contato já fechado (Won) continuam
    // sendo descartes legítimos, e provisionar o Front Desk é uma ESCRITA.
    // Fazê-la antes deixaria a org com um rep "Front Desk, 0 calls" no ranking
    // por causa de uma call que nem chegou a ser gravada.
    const shortCallIdx = webhookRouteSource.indexOf('isConfirmedShortCall(durationSeconds)')
    const wonGateIdx = webhookRouteSource.indexOf('skipped_contact_already_won')
    const frontDeskIdx = webhookRouteSource.indexOf('dbGetOrCreateFrontDeskTrainer(orgConfig.orgId)')
    expect(shortCallIdx).toBeGreaterThan(-1)
    expect(wonGateIdx).toBeGreaterThan(-1)
    expect(frontDeskIdx).toBeGreaterThan(-1)
    expect(shortCallIdx).toBeLessThan(wonGateIdx)
    expect(wonGateIdx).toBeLessThan(frontDeskIdx)
  })

  it('convite pendente NÃO bloqueia: o alerta vem DEPOIS do insert', () => {
    const insertIdx = webhookRouteSource.indexOf('dbUpsertGhlCall({')
    const alertIdx = webhookRouteSource.indexOf('notifyPipelineFailure("trainer_invite_pending"')
    expect(alertIdx).toBeGreaterThan(-1)
    expect(alertIdx).toBeGreaterThan(insertIdx)
  })

  it('a call do Front Desk gera alerta — o silêncio era a causa do bug', () => {
    expect(webhookRouteSource).toContain('notifyPipelineFailure("unlinked_trainer"')
  })

  it('falha ao provisionar o Front Desk devolve erro, não 200 silencioso', () => {
    // Um 200 aqui seria perder a call de novo. 500 faz o GHL reentregar.
    const fdIdx = webhookRouteSource.indexOf('dbGetOrCreateFrontDeskTrainer(orgConfig.orgId)')
    const errIdx = webhookRouteSource.indexOf('jsonError("Server error", 500)', fdIdx)
    expect(errIdx).toBeGreaterThan(fdIdx)
  })

  it('a call do Front Desk grava o nome do Front Desk em trainer_name', () => {
    // Consistência entre a lista de calls e o ranking. O cliente vendo um nome
    // de pessoa na lista enquanto aquelas calls somam no Front Desk gera
    // exatamente a dúvida que originou esta investigação. O nome cru do GHL
    // continua em ghl_payload pra investigação.
    expect(webhookRouteSource).toContain('FRONT_DESK_NAME')
    expect(webhookRouteSource).toMatch(/trainerName:\s*FRONT_DESK_NAME/)
  })
})

// ─── Árvore de decisão replicada inline (réplica pura, sem I/O) ─────────────

interface TrainerLink {
  trainerId: string
  name: string
  email: string | null
  inviteStatus: string
}

interface PayloadNames {
  trainerName: string
  trainerEmail: string | null
}

interface ResolvedRep {
  trainerId: string
  trainerName: string
  trainerEmail: string | null
  isFrontDesk: boolean
  /** Dispara o alerta informativo de convite pendente depois do insert. */
  alertInvitePending: boolean
}

const FRONT_DESK_ID = 'front-desk-trainer-id'

/** Réplica pura da resolução em app/api/webhooks/ghl/route.ts (passo 5e). */
function resolveRep(trainerLink: TrainerLink | null, payload: PayloadNames): ResolvedRep {
  if (!trainerLink) {
    return {
      trainerId: FRONT_DESK_ID,
      // O nome do Front Desk, não o do payload — ver o teste de contrato acima.
      trainerName: FRONT_DESK_NAME,
      // Sem email: o do payload pode ser de alguém fora da plataforma.
      trainerEmail: null,
      isFrontDesk: true,
      alertInvitePending: false,
    }
  }
  return {
    trainerId: trainerLink.trainerId,
    trainerName: trainerLink.name !== '—' ? trainerLink.name : payload.trainerName,
    trainerEmail: trainerLink.email ?? payload.trainerEmail,
    isFrontDesk: false,
    alertInvitePending: trainerLink.inviteStatus !== 'accepted',
  }
}

const payload: PayloadNames = { trainerName: 'Recepção Loja 2', trainerEmail: 'front@cliente.com' }

const accepted: TrainerLink = {
  trainerId: 't1',
  name: 'Marcus R.',
  email: 'marcus@cliente.com',
  inviteStatus: 'accepted',
}

describe('resolveRep › réplica pura da resolução do webhook', () => {
  it('sem vínculo → Front Desk, e NUNCA descarta', () => {
    const r = resolveRep(null, payload)
    expect(r.isFrontDesk).toBe(true)
    expect(r.trainerId).toBe(FRONT_DESK_ID)
    expect(r.alertInvitePending).toBe(false)
  })

  it('sem vínculo → a call mostra o Front Desk, igual ao ranking', () => {
    const r = resolveRep(null, payload)
    expect(r.trainerName).toBe(FRONT_DESK_NAME)
    // Nada de guardar o email de quem não está na plataforma numa coluna que
    // algum caminho futuro poderia usar pra mandar mensagem.
    expect(r.trainerEmail).toBeNull()
  })

  it('vinculado e aceito → rep real, sem alerta', () => {
    const r = resolveRep(accepted, payload)
    expect(r.isFrontDesk).toBe(false)
    expect(r.trainerId).toBe('t1')
    expect(r.alertInvitePending).toBe(false)
  })

  it('vinculado com convite pendente → rep REAL (não Front Desk) + alerta', () => {
    // A inversão de e86609d: o rep existe e é conhecido, então a atribuição que
    // já temos em mãos não é jogada fora.
    const r = resolveRep({ ...accepted, inviteStatus: 'pending' }, payload)
    expect(r.isFrontDesk).toBe(false)
    expect(r.trainerId).toBe('t1')
    expect(r.alertInvitePending).toBe(true)
  })

  it('qualquer invite_status != accepted alerta (defensivo, não só "pending")', () => {
    expect(resolveRep({ ...accepted, inviteStatus: 'revoked' }, payload).alertInvitePending).toBe(true)
  })

  it('vinculado: users.name substitui o nome cru do GHL', () => {
    // O payload pode trazer o nome da Location/Company em vez do usuário real.
    expect(resolveRep(accepted, payload).trainerName).toBe('Marcus R.')
  })

  it('vinculado sem nome em users (—) → cai no nome do payload', () => {
    expect(resolveRep({ ...accepted, name: '—' }, payload).trainerName).toBe('Recepção Loja 2')
  })

  it('vinculado sem email em users → cai no email do payload', () => {
    expect(resolveRep({ ...accepted, email: null }, payload).trainerEmail).toBe('front@cliente.com')
  })
})
