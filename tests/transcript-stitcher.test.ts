/**
 * Costura dos transcripts parciais dos chunks (lib/services/transcript-stitcher).
 *
 * Os chunks são cortados COM overlap, então a fala do limite aparece duas vezes
 * (cauda de um chunk + cabeça do próximo). O stitcher remonta o texto removendo
 * essa duplicata via alinhamento por palavras. Função pura — testável sem áudio.
 */
import { describe, it, expect } from 'vitest'
import { stitchChunkTranscripts } from '@/lib/services/transcript-stitcher'

describe('stitchChunkTranscripts', () => {
  it('remove o overlap entre chunks consecutivos', () => {
    const stitched = stitchChunkTranscripts([
      {
        chunkIndex: 0,
        overlapMs: 0,
        transcript: 'Hello there how are you doing today I wanted to talk about the program',
      },
      {
        chunkIndex: 1,
        overlapMs: 10_000,
        transcript: 'talk about the program and the next steps for your dog',
      },
    ])

    // "talk about the program" (4 palavras) aparece só uma vez.
    expect(stitched).toBe(
      'Hello there how are you doing today I wanted to talk about the program and the next steps for your dog',
    )
  })

  it('alinha ignorando caixa e pontuação (normalização)', () => {
    const stitched = stitchChunkTranscripts([
      { chunkIndex: 0, overlapMs: 0, transcript: 'we discussed the price and the plan.' },
      { chunkIndex: 1, overlapMs: 8_000, transcript: 'The Price, and the plan are locked in now' },
    ])

    expect(stitched).toBe('we discussed the price and the plan. are locked in now')
  })

  it('sem overlap real (match abaixo do mínimo) faz concatenação simples', () => {
    const stitched = stitchChunkTranscripts([
      { chunkIndex: 0, overlapMs: 0, transcript: 'first segment ends here' },
      { chunkIndex: 1, overlapMs: 10_000, transcript: 'totally different words follow' },
    ])

    expect(stitched).toBe('first segment ends here totally different words follow')
  })

  it('respeita a ordem por chunk_index mesmo fora de ordem na entrada', () => {
    const stitched = stitchChunkTranscripts([
      { chunkIndex: 1, overlapMs: 10_000, transcript: 'world from chunk two' },
      { chunkIndex: 0, overlapMs: 0, transcript: 'hello world from chunk' },
    ])

    // overlap "world from chunk" (3 palavras) < mínimo de 4 → concatena.
    expect(stitched).toBe('hello world from chunk world from chunk two')
  })

  it('ignora chunks vazios/sem transcript', () => {
    const stitched = stitchChunkTranscripts([
      { chunkIndex: 0, overlapMs: 0, transcript: 'only real content' },
      { chunkIndex: 1, overlapMs: 10_000, transcript: '   ' },
      { chunkIndex: 2, overlapMs: 10_000, transcript: null },
    ])

    expect(stitched).toBe('only real content')
  })

  it('retorna string vazia quando não há nada transcrito', () => {
    expect(stitchChunkTranscripts([])).toBe('')
    expect(
      stitchChunkTranscripts([{ chunkIndex: 0, overlapMs: 0, transcript: null }]),
    ).toBe('')
  })
})
