/**
 * Selecao da amostra do Marketing Intelligence
 *
 * Antes: pool do top 10 por score + `pickRandomSample` — 3 a 5 calls sorteadas.
 * A mesma base produzia copy diferente a cada execucao, e a amostra era ~1% de
 * uma org com 400 calls.
 *
 * Agora: selecao deterministica, faixa de qualidade calibrada contra a base de
 * producao, e particao ganhas/perdidas. Este arquivo cobre a logica pura —
 * nada aqui toca banco nem LLM.
 */

import { describe, it, expect } from 'vitest'
import type { DbCall } from '@/lib/db/calls'
import {
  compareForSample,
  hasUsableTranscript,
  partitionSample,
  wordCount,
  MIN_WPM,
  MAX_WPM,
  MIN_WORDS_WITHOUT_DURATION,
  TARGET_CLOSED,
  TARGET_NOT_CLOSED,
} from '@/lib/services/marketing-intelligence'

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Transcricao com exatamente `n` palavras. */
function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `palavra${i}`).join(' ')
}

/** Segundos que fazem `wordCount` palavras renderem exatamente `wpm`. */
function secondsFor(wordTotal: number, wpm: number): number {
  return (wordTotal / wpm) * 60
}

let seq = 0

function makeCall(over: Partial<DbCall> = {}): DbCall {
  seq += 1
  const base: DbCall = {
    id: `call-${String(seq).padStart(3, '0')}`,
    org_id: 'org-1',
    rubric_id: null,
    trainer_id: null,
    trainer_name: 'Rep',
    trainer_email: null,
    transcript: words(600),
    overall_score: 80,
    summary: null,
    strengths: null,
    improvements: null,
    email_sent: false,
    email_id: null,
    created_at: '2026-09-01T12:00:00Z',
    updated_at: '2026-09-01T12:00:00Z',
    call_outcome: 'closed',
    client_name: 'Prospect',
    detected_outcome: null,
    model_used: null,
    input_tokens: null,
    output_tokens: null,
    cost_usd: null,
    prompt_version: null,
    sections: null,
    closed: true,
    call_date: null,
    duration_seconds: secondsFor(600, 150),
    lead_name: null,
    lead_source: null,
  }
  return { ...base, ...over }
}

// ─── wordCount ───────────────────────────────────────────────────────────────

describe('wordCount', () => {
  it('conta palavras separadas por qualquer espaco', () => {
    expect(wordCount('uma  duas\ntres\tquatro')).toBe(4)
  })

  it('transcricao vazia ou so espaco conta zero', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('   \n  ')).toBe(0)
  })
})

// ─── hasUsableTranscript ─────────────────────────────────────────────────────

describe('hasUsableTranscript › faixa de palavras por minuto', () => {
  it('aceita a massa real da base (150 WPM)', () => {
    expect(
      hasUsableTranscript({ transcript: words(600), duration_seconds: secondsFor(600, 150) }),
    ).toBe(true)
  })

  it('rejeita transcricao truncada — abaixo do piso', () => {
    expect(
      hasUsableTranscript({ transcript: words(60), duration_seconds: secondsFor(60, MIN_WPM - 20) }),
    ).toBe(false)
  })

  it('rejeita duracao corrompida — acima do teto', () => {
    // O caso real: transcricao inteira com duration_seconds de poucos segundos.
    expect(
      hasUsableTranscript({ transcript: words(3000), duration_seconds: 8 }),
    ).toBe(false)
  })

  it('aceita exatamente no piso e no teto', () => {
    expect(
      hasUsableTranscript({ transcript: words(600), duration_seconds: secondsFor(600, MIN_WPM) }),
    ).toBe(true)
    expect(
      hasUsableTranscript({ transcript: words(600), duration_seconds: secondsFor(600, MAX_WPM) }),
    ).toBe(true)
  })

  it('transcricao vazia nunca passa — cobre no_recording e transcription_failed', () => {
    expect(hasUsableTranscript({ transcript: '', duration_seconds: 1800 })).toBe(false)
    expect(hasUsableTranscript({ transcript: null, duration_seconds: 1800 })).toBe(false)
  })
})

describe('hasUsableTranscript › sem duracao confiavel', () => {
  it.each([null, 0])('duration_seconds %s cai para o piso de palavras', (seconds) => {
    expect(
      hasUsableTranscript({ transcript: words(MIN_WORDS_WITHOUT_DURATION), duration_seconds: seconds }),
    ).toBe(true)
    expect(
      hasUsableTranscript({ transcript: words(MIN_WORDS_WITHOUT_DURATION - 1), duration_seconds: seconds }),
    ).toBe(false)
  })
})

// ─── compareForSample ────────────────────────────────────────────────────────

describe('compareForSample › ordem estavel', () => {
  it('score maior primeiro', () => {
    const a = { overall_score: 90, created_at: '2026-01-01T00:00:00Z', id: 'a' }
    const b = { overall_score: 70, created_at: '2026-01-01T00:00:00Z', id: 'b' }
    expect(compareForSample(a, b)).toBeLessThan(0)
  })

  it('score empatado desempata pela mais recente', () => {
    const older = { overall_score: 90, created_at: '2026-01-01T00:00:00Z', id: 'a' }
    const newer = { overall_score: 90, created_at: '2026-06-01T00:00:00Z', id: 'b' }
    expect(compareForSample(older, newer)).toBeGreaterThan(0)
  })

  it('score e data empatados desempatam pelo id — sem isso a amostra oscila', () => {
    const x = { overall_score: 90, created_at: '2026-01-01T00:00:00Z', id: 'aaa' }
    const y = { overall_score: 90, created_at: '2026-01-01T00:00:00Z', id: 'bbb' }
    expect(compareForSample(x, y)).toBeLessThan(0)
    expect(compareForSample(y, x)).toBeGreaterThan(0)
  })

  it('score nulo vai para o fim, nao para o topo', () => {
    const scored = { overall_score: 10, created_at: '2026-01-01T00:00:00Z', id: 'a' }
    const unscored = { overall_score: null, created_at: '2026-01-01T00:00:00Z', id: 'b' }
    expect(compareForSample(scored, unscored)).toBeLessThan(0)
  })
})

// ─── partitionSample ─────────────────────────────────────────────────────────

describe('partitionSample › proporcao', () => {
  it('pega 12 fechadas e 6 perdidas quando ha volume de sobra', () => {
    const calls = [
      ...Array.from({ length: 40 }, (_, i) => makeCall({ call_outcome: 'closed', overall_score: 50 + i })),
      ...Array.from({ length: 40 }, (_, i) => makeCall({ call_outcome: 'not_closed', overall_score: 50 + i })),
    ]
    const { closed, notClosed } = partitionSample(calls)
    expect(closed).toHaveLength(TARGET_CLOSED)
    expect(notClosed).toHaveLength(TARGET_NOT_CLOSED)
  })

  it('escolhe as de maior score dos dois lados', () => {
    const calls = Array.from({ length: 30 }, (_, i) =>
      makeCall({ call_outcome: 'closed', overall_score: i }),
    )
    const { closed } = partitionSample(calls)
    expect(closed.map((c) => c.overall_score)).toEqual([29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18])
  })

  it('nao mistura os dois lados', () => {
    const calls = [
      makeCall({ call_outcome: 'closed', overall_score: 10 }),
      makeCall({ call_outcome: 'not_closed', overall_score: 99 }),
    ]
    const { closed, notClosed } = partitionSample(calls)
    expect(closed.every((c) => c.call_outcome === 'closed')).toBe(true)
    expect(notClosed.every((c) => c.call_outcome === 'not_closed')).toBe(true)
  })
})

describe('partitionSample › determinismo', () => {
  it('a mesma base em qualquer ordem de entrada produz a mesma amostra', () => {
    const calls = Array.from({ length: 60 }, (_, i) =>
      makeCall({
        call_outcome: i % 2 === 0 ? 'closed' : 'not_closed',
        overall_score: 60 + (i % 7),
        created_at: `2026-0${(i % 9) + 1}-01T00:00:00Z`,
      }),
    )

    const first = partitionSample(calls)
    const reversed = partitionSample([...calls].reverse())
    const rotated = partitionSample([...calls.slice(17), ...calls.slice(0, 17)])

    const ids = (r: { closed: DbCall[]; notClosed: DbCall[] }) => [
      r.closed.map((c) => c.id),
      r.notClosed.map((c) => c.id),
    ]

    expect(ids(reversed)).toEqual(ids(first))
    expect(ids(rotated)).toEqual(ids(first))
  })

  it('duas execucoes seguidas sobre os mesmos dados coincidem', () => {
    const calls = Array.from({ length: 30 }, () => makeCall({ overall_score: 80 }))
    expect(partitionSample(calls).closed.map((c) => c.id)).toEqual(
      partitionSample(calls).closed.map((c) => c.id),
    )
  })

  it('nao sobrou sorteio no modulo', async () => {
    const { readFileSync } = await import('fs')
    const { resolve } = await import('path')
    const src = readFileSync(
      resolve(__dirname, '..', 'lib/services/marketing-intelligence.ts'),
      'utf-8',
    )
    // Tira comentarios antes de olhar: a doc de partitionSample cita
    // `pickRandomSample` de proposito, para registrar o que saiu e por que.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
    expect(code).not.toMatch(/Math\.random/)
    expect(code).not.toMatch(/pickRandomSample/)
  })
})

describe('partitionSample › filtros de qualidade', () => {
  it('descarta call sem score', () => {
    const calls = [
      makeCall({ overall_score: null }),
      makeCall({ overall_score: 90 }),
    ]
    expect(partitionSample(calls).closed).toHaveLength(1)
  })

  it('descarta transcricao truncada e duracao corrompida', () => {
    const calls = [
      makeCall({ transcript: words(60), duration_seconds: secondsFor(60, 20) }),
      makeCall({ transcript: words(3000), duration_seconds: 8 }),
      makeCall({ transcript: words(600), duration_seconds: secondsFor(600, 150) }),
    ]
    expect(partitionSample(calls).closed).toHaveLength(1)
  })

  it('call sem gravacao nao entra — transcript vazio com duracao presente', () => {
    const calls = [makeCall({ transcript: null, duration_seconds: 1800 })]
    expect(partitionSample(calls).closed).toHaveLength(0)
  })
})

describe('partitionSample › degradacao', () => {
  it('menos fechadas que o alvo usa o que tem', () => {
    const calls = Array.from({ length: 3 }, () => makeCall({ call_outcome: 'closed' }))
    expect(partitionSample(calls).closed).toHaveLength(3)
  })

  it('org sem perdidas segue so com fechadas', () => {
    const calls = Array.from({ length: 20 }, () => makeCall({ call_outcome: 'closed' }))
    const { closed, notClosed } = partitionSample(calls)
    expect(closed).toHaveLength(TARGET_CLOSED)
    expect(notClosed).toHaveLength(0)
  })

  it('org sem fechadas devolve vazio — quem lanca o erro e selectSample', () => {
    const calls = Array.from({ length: 20 }, () => makeCall({ call_outcome: 'not_closed' }))
    const { closed, notClosed } = partitionSample(calls)
    expect(closed).toHaveLength(0)
    expect(notClosed).toHaveLength(TARGET_NOT_CLOSED)
  })

  it('outcome nulo nao entra em nenhum dos lados', () => {
    const calls = [makeCall({ call_outcome: null })]
    const { closed, notClosed } = partitionSample(calls)
    expect(closed).toHaveLength(0)
    expect(notClosed).toHaveLength(0)
  })
})
