/**
 * TC-FRONT-DESK-REASSIGN — Migração das calls do Front Desk pro rep real
 *
 * A atribuição ao Front Desk é PROVISÓRIA: quando o GHLUSERID da call passa a
 * ser um membro ativo, a call migra pro rep real com a nota junto — o vendedor
 * recebe o crédito que é dele.
 *
 * O que mudou em relação à recuperação da 096: lá a call entrava BLOQUEADA e
 * nunca tinha sido processada, então recuperar era rodar o pipeline do zero
 * (download + Whisper + chunking, ~6min, exigindo token GHL ativo). Aqui a call
 * já está transcrita e pontuada — migrar é trocar trainer_id e ressincronizar
 * os dois reps afetados.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import { isInFlightCall } from '@/lib/db/calls'

const ROOT = resolve(__dirname, '..')

const recoverySource = readFileSync(
  resolve(ROOT, 'lib/services/ghl-call-recovery.ts'),
  'utf-8',
)

const pipelineSource = readFileSync(
  resolve(ROOT, 'lib/services/chunk-pipeline.ts'),
  'utf-8',
)

const callsDbSource = readFileSync(resolve(ROOT, 'lib/db/calls.ts'), 'utf-8')

// ─── isInFlightCall — função real, sem I/O ──────────────────────────────────

describe('isInFlightCall › calls que o pipeline ainda está mexendo', () => {
  it.each(['pending', 'processing', 'queued_for_chunking', 'chunking', 'awaiting_chunks', 'consolidating'] as const)(
    '%s está em voo — não reatribuir agora',
    (status) => {
      expect(isInFlightCall(status)).toBe(true)
    },
  )

  it.each(['transcribed', 'no_recording', 'transcription_failed', 'webhook_failed', 'auth_expired'] as const)(
    '%s é terminal — pode reatribuir',
    (status) => {
      expect(isInFlightCall(status)).toBe(false)
    },
  )

  it('status null não conta como em voo (call legada, pré-migration 044)', () => {
    expect(isInFlightCall(null)).toBe(false)
  })
})

// ─── Contrato: o serviço de migração não reprocessa nem lança ───────────────

describe('Contrato › lib/services/ghl-call-recovery.ts', () => {
  it('NÃO roda o pipeline de novo — a call já foi transcrita e pontuada', () => {
    // Asserção sobre o MÓDULO, não sobre o identificador: o JSDoc do arquivo
    // cita processGhlCall de propósito, pra explicar o que mudou vs. a 096. O
    // caminho do módulo, por outro lado, só aparece num import.
    expect(recoverySource).not.toContain('ghl-call-pipeline')
  })

  it('não depende mais do token GHL da org', () => {
    // A versão da 096 precisava do accessToken pra rebaixar a gravação; org com
    // integração desativada ficava com as calls presas. Migrar não precisa.
    expect(recoverySource).not.toContain('db/organizations')
  })

  it('ressincroniza os DOIS reps — o Front Desk perde a call, o real ganha', () => {
    expect(recoverySource).toMatch(/syncTrainerStats\(frontDeskId\)/)
    expect(recoverySource).toMatch(/syncTrainerStats\(link\.trainerId\)/)
  })

  it('só migra com o vínculo ATIVO (invite aceito)', () => {
    expect(recoverySource).toMatch(/!link\.inviteAccepted/)
  })

  it('nunca lança — o corpo inteiro está protegido', () => {
    expect(recoverySource).toMatch(/\}\s*catch\s*\(err\)\s*\{/)
    expect(recoverySource).toContain('[front-desk-reassign] falha ao migrar calls')
  })

  it('guarda contra o GHLUSERID vinculado ao próprio Front Desk', () => {
    expect(recoverySource).toMatch(/link\.trainerId === frontDeskId/)
  })

  it('a call migrada deixa de ser Front Desk em TUDO — nome vai junto do id', () => {
    // Sem isto a call trocaria de dono no ranking mas continuaria escrita
    // "Front Desk - AskMoses" na lista — a mesma inconsistência que a gente
    // acabou de eliminar do webhook, só que do outro lado.
    expect(recoverySource).toMatch(/trainerName:\s*link\.name/)
    expect(callsDbSource).toMatch(/trainer_name:\s*input\.trainerName/)
  })
})

// ─── Contrato: o catch-up no fim do pipeline ───────────────────────────────
// Sem ele, uma call que estava EM VOO no momento do vínculo ficaria presa no
// Front Desk pra sempre: os dois gatilhos de migração são eventos únicos
// (vincular e aceitar) e a migração daquele instante pulou a call em voo.

describe('Contrato › lib/services/chunk-pipeline.ts — catch-up de atribuição', () => {
  it('o pipeline tenta migrar a call ao terminar', () => {
    expect(pipelineSource).toContain('reassignFrontDeskCalls')
  })

  it('o catch-up roda ANTES do scoring', () => {
    // Dois motivos. (1) runGhlCallScoring lê a linha da call uma vez, no
    // início: migrando antes, ele já captura o trainer_id certo. (2) o catch
    // de scoring faz `return` — um catch-up depois dele seria pulado
    // justamente nas calls que falharam, e elas ficariam presas no Front Desk
    // pra sempre, já que os dois gatilhos de migração são eventos únicos.
    const scoringIdx = pipelineSource.indexOf('runGhlCallScoring(callId)')
    expect(scoringIdx).toBeGreaterThan(-1)
    // lastIndexOf a partir do scoring: robusto a reformatação, e prova que
    // existe uma chamada de catch-up no caminho que chega até o scoring.
    const catchUpIdx = pipelineSource.lastIndexOf('await frontDeskCatchUp(callId)', scoringIdx)
    expect(catchUpIdx).toBeGreaterThan(-1)
  })

  it('o caminho de falha de consolidação também chama o catch-up', () => {
    // Call sem transcript continua existindo e atribuída — sair dali sem o
    // catch-up a deixaria presa no Front Desk igual.
    const consolidationFail = pipelineSource.indexOf("processingStatus: 'transcription_failed'")
    const scoringIdx = pipelineSource.indexOf('runGhlCallScoring(callId)')
    const catchUpInFail = pipelineSource.indexOf('await frontDeskCatchUp(callId)', consolidationFail)
    expect(consolidationFail).toBeGreaterThan(-1)
    expect(catchUpInFail).toBeGreaterThan(consolidationFail)
    expect(catchUpInFail).toBeLessThan(scoringIdx)
  })

  it('o catch-up só paga os lookups de migração pra call parada no Front Desk', () => {
    // Sem este gate, toda call normal pagaria os 3 round trips de
    // reassignFrontDeskCalls no caminho quente do finalize.
    expect(pipelineSource).toMatch(/call\.trainer_id !== frontDeskId/)
  })
})

// ─── Árvore de decisão replicada inline ────────────────────────────────────

interface Link {
  trainerId: string
  inviteAccepted: boolean
}

type ReassignOutcome =
  | { action: 'noop'; reason: 'no_ghl_user' | 'no_link' | 'invite_pending' | 'no_front_desk' | 'self_link' | 'nothing_to_move' | 'all_in_flight' }
  | { action: 'move'; callIds: string[]; skippedInFlight: number }

interface Candidate {
  id: string
  inFlight: boolean
}

/** Réplica pura de reassignFrontDeskCalls. */
function decideReassign(
  ghlUserId: string | null,
  link: Link | null,
  frontDeskId: string | null,
  candidates: Candidate[],
): ReassignOutcome {
  if (!ghlUserId?.trim()) return { action: 'noop', reason: 'no_ghl_user' }
  if (!link) return { action: 'noop', reason: 'no_link' }
  if (!link.inviteAccepted) return { action: 'noop', reason: 'invite_pending' }
  if (!frontDeskId) return { action: 'noop', reason: 'no_front_desk' }
  if (link.trainerId === frontDeskId) return { action: 'noop', reason: 'self_link' }
  if (candidates.length === 0) return { action: 'noop', reason: 'nothing_to_move' }

  const ready = candidates.filter((c) => !c.inFlight)
  if (ready.length === 0) return { action: 'noop', reason: 'all_in_flight' }

  return {
    action: 'move',
    callIds: ready.map((c) => c.id),
    skippedInFlight: candidates.length - ready.length,
  }
}

const FD = 'front-desk-id'
const activeLink: Link = { trainerId: 'real-rep', inviteAccepted: true }

describe('decideReassign › réplica pura da migração', () => {
  it('sem GHLUSERID → no-op (a call sem userId fica no Front Desk em definitivo)', () => {
    expect(decideReassign(null, activeLink, FD, [{ id: 'c1', inFlight: false }])).toEqual({
      action: 'noop',
      reason: 'no_ghl_user',
    })
  })

  it('GHLUSERID só com espaços → no-op', () => {
    expect(decideReassign('   ', activeLink, FD, [])).toEqual({ action: 'noop', reason: 'no_ghl_user' })
  })

  it('convite ainda pendente → no-op (o gatilho roda de novo no aceite)', () => {
    const pending: Link = { trainerId: 'real-rep', inviteAccepted: false }
    expect(decideReassign('ghl-1', pending, FD, [{ id: 'c1', inFlight: false }])).toEqual({
      action: 'noop',
      reason: 'invite_pending',
    })
  })

  it('org sem Front Desk provisionado → no-op (nunca recebeu call órfã)', () => {
    expect(decideReassign('ghl-1', activeLink, null, [])).toEqual({
      action: 'noop',
      reason: 'no_front_desk',
    })
  })

  it('GHLUSERID vinculado ao próprio Front Desk → no-op, não move a call pra ela mesma', () => {
    const selfLink: Link = { trainerId: FD, inviteAccepted: true }
    expect(decideReassign('ghl-1', selfLink, FD, [{ id: 'c1', inFlight: false }])).toEqual({
      action: 'noop',
      reason: 'self_link',
    })
  })

  it('vínculo ativo + calls terminais → move todas', () => {
    expect(
      decideReassign('ghl-1', activeLink, FD, [
        { id: 'c1', inFlight: false },
        { id: 'c2', inFlight: false },
      ]),
    ).toEqual({ action: 'move', callIds: ['c1', 'c2'], skippedInFlight: 0 })
  })

  it('mistura → move só as terminais e conta as que ficaram', () => {
    expect(
      decideReassign('ghl-1', activeLink, FD, [
        { id: 'c1', inFlight: false },
        { id: 'c2', inFlight: true },
        { id: 'c3', inFlight: false },
      ]),
    ).toEqual({ action: 'move', callIds: ['c1', 'c3'], skippedInFlight: 1 })
  })

  it('todas em voo → no-op agora, migram no próximo gatilho', () => {
    expect(
      decideReassign('ghl-1', activeLink, FD, [{ id: 'c1', inFlight: true }]),
    ).toEqual({ action: 'noop', reason: 'all_in_flight' })
  })

  it('é idempotente: rodar de novo sem candidatas é no-op', () => {
    expect(decideReassign('ghl-1', activeLink, FD, [])).toEqual({
      action: 'noop',
      reason: 'nothing_to_move',
    })
  })
})
