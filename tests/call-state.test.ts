/**
 * Classificação de estado da call (lib/call-state.ts)
 *
 * Contexto: a tela de detalhe tratava quatro situações distintas como uma só.
 * Uma call que chegou há dois minutos mostrava rubrica 0.0 nas cinco seções,
 * Intent Index 2.5 e a pill vermelha "Not Closed" — o cliente lia ausência de
 * medição como uma conversa péssima.
 *
 * Os casos aqui são reais, tirados do banco em 2026-09.
 */

import { describe, it, expect } from 'vitest'
import {
  callState,
  canReprocess,
  hasAnalysis,
  showsEvaluation,
  type CallStateInput,
} from '@/lib/call-state'

const secoes = [{ name: 'Discovery', score: 88, feedback: '' }]

describe('callState › precedência', () => {
  it('não-venda ganha do status, mesmo com o pipeline dizendo transcribed', () => {
    // Caso real: badd86bb — ligação sobre problema de pagamento. O gate zerou
    // score e sections mas NÃO mexeu em processing_status, que ficou
    // 'transcribed'. Sem esta precedência a tela prometeria uma análise que
    // nunca vem.
    expect(
      callState({ isSalesCall: false, processingStatus: 'transcribed', sections: null, score: null }),
    ).toBe('not_sales')
  })

  it('não-venda ganha até de falha de pipeline', () => {
    expect(callState({ isSalesCall: false, processingStatus: 'transcription_failed' })).toBe('not_sales')
  })

  it('falha terminal ganha de "tem análise" parcial', () => {
    expect(callState({ processingStatus: 'no_recording', score: null })).toBe('unavailable')
  })

  it('TEM ANÁLISE ganha de "em progresso" — o scoring não muda o status', () => {
    // Uma call GHL pontuada fica em 'transcribed' pra sempre. Invertida a
    // ordem, toda call analisada viraria 'analyzing'.
    expect(callState({ processingStatus: 'transcribed', sections: secoes, score: 88 })).toBe('analyzed')
  })
})

describe('callState › em análise', () => {
  it.each([
    'pending', 'processing', 'queued_for_chunking',
    'chunking', 'awaiting_chunks', 'consolidating', 'transcribed',
  ])('%s sem análise ainda é "analyzing"', (status) => {
    expect(callState({ processingStatus: status, sections: null, score: null })).toBe('analyzing')
  })
})

describe('callState › não analisável', () => {
  it.each(['transcription_failed', 'no_recording', 'auth_expired', 'webhook_failed'])(
    '%s é "unavailable"',
    (status) => {
      expect(callState({ processingStatus: status })).toBe('unavailable')
    },
  )

  it('sem análise e sem pipeline em voo também é "unavailable" — não há o que esperar', () => {
    expect(callState({ processingStatus: null, sections: null, score: null })).toBe('unavailable')
  })
})

describe('callState › analisada', () => {
  it('com seções', () => {
    expect(callState({ sections: secoes, score: 88 })).toBe('analyzed')
  })

  it('call legada: score sem seções ainda conta', () => {
    expect(callState({ sections: null, score: 72 })).toBe('analyzed')
  })

  it('score 0 é análise, não ausência — existe call genuinamente ruim', () => {
    // 51 calls na base com score <= 5. Tratar zero como "sem análise" esconderia
    // justamente a pior avaliação real.
    expect(callState({ sections: secoes, score: 0 })).toBe('analyzed')
    expect(hasAnalysis({ score: 0 })).toBe(true)
  })

  it('isSalesCall null (call legada, não classificada) não vira não-venda', () => {
    expect(callState({ isSalesCall: null, sections: secoes, score: 80 })).toBe('analyzed')
  })
})

describe('showsEvaluation', () => {
  it('só a analisada mostra os números', () => {
    expect(showsEvaluation('analyzed')).toBe(true)
    for (const s of ['analyzing', 'unavailable', 'not_sales'] as const) {
      expect(showsEvaluation(s)).toBe(false)
    }
  })
})

describe('canReprocess', () => {
  it.each(['transcription_failed', 'auth_expired', 'webhook_failed'])(
    '%s pode ser reprocessada',
    (status) => {
      expect(canReprocess({ processingStatus: status })).toBe(true)
    },
  )

  it('no_recording NÃO — não houve gravação, não há o que reprocessar', () => {
    expect(canReprocess({ processingStatus: 'no_recording' })).toBe(false)
  })

  it('não-venda NÃO — o classificador acertou, reprocessar gastaria LLM à toa', () => {
    // Hoje a CallsTable oferece o botão nesse caso, por não fazer a distinção.
    expect(canReprocess({ isSalesCall: false, processingStatus: 'transcribed' })).toBe(false)
  })

  it('call em análise NÃO — ainda está rodando', () => {
    expect(canReprocess({ processingStatus: 'chunking' })).toBe(false)
  })

  it('call analisada NÃO', () => {
    expect(canReprocess({ processingStatus: 'transcribed', sections: secoes, score: 88 })).toBe(false)
  })
})

describe('caso real › badd86bb-1cf9-4498-9298-23b0fe85b468', () => {
  // Ligação sobre problema de pagamento, classificada corretamente como
  // não-venda. Na tela o cliente via rubrica 0.0 ×5, Intent Index 2.5 e a pill
  // vermelha "Not Closed" — três fabricações sobre uma conversa que o sistema
  // decidiu, com razão, não medir.
  const call: CallStateInput = {
    isSalesCall: false,
    processingStatus: 'transcribed',
    sections: null,
    score: null,
  }

  it('é não-venda', () => {
    expect(callState(call)).toBe('not_sales')
  })

  it('não mostra avaliação nenhuma', () => {
    expect(showsEvaluation(callState(call))).toBe(false)
  })

  it('não oferece reprocessamento', () => {
    expect(canReprocess(call)).toBe(false)
  })
})

// ─── readStoredIntent: ausência é ausência ───────────────────────────────────

describe('readStoredIntent', () => {
  it('null devolve null, não o mínimo da escala', async () => {
    // O guard antigo tratava null explicitamente mas delegava a resolveIntent,
    // que refaz Number(null) === 0 dentro de clampIntent e devolve 1. Esse 1
    // chegava à CallsTable e à ordenação de agendamentos como se fosse medição.
    const { readStoredIntent } = await import('@/lib/services/calls')
    expect(readStoredIntent(null, 'not_closed')).toBeNull()
    expect(readStoredIntent(undefined, 'not_closed')).toBeNull()
    expect(readStoredIntent('', 'closed')).toBeNull()
  })

  it('valor gravado é preservado', async () => {
    const { readStoredIntent } = await import('@/lib/services/calls')
    expect(readStoredIntent(3.4, 'closed')).toBe(3.4)
    expect(readStoredIntent('2.5', 'not_closed')).toBe(2.5)
  })

  it('zero gravado é medição, não ausência', async () => {
    // 49 calls na base têm intent 0 com os quatro sinais zerados — conversa
    // curta em que o lead não demonstrou sinal nenhum. É medição legítima.
    const { readStoredIntent } = await import('@/lib/services/calls')
    expect(readStoredIntent(0, 'not_closed')).toBe(0)
  })

  it('clampa fora da escala', async () => {
    const { readStoredIntent } = await import('@/lib/services/calls')
    expect(readStoredIntent(9, 'closed')).toBe(5)
    expect(readStoredIntent(-2, 'not_closed')).toBe(0)
  })

  it('lixo não-numérico devolve null, não um default por desfecho', async () => {
    const { readStoredIntent } = await import('@/lib/services/calls')
    expect(readStoredIntent('abc', 'closed')).toBeNull()
  })
})
