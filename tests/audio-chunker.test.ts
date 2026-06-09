/**
 * Chunker de áudio (lib/services/audio-chunker) — a peça que conserta a raiz do
 * problema: calls grandes estouravam o limite de 25MB do Whisper.
 *
 * Gera áudio sintético com o próprio ffmpeg (ffmpeg-static) e corta de verdade,
 * então é um teste de integração leve — não mocka o ffmpeg.
 *
 * O teste-chave (">200MB") prova a garantia central: como o chunker TRANSCODA
 * pra mp3 mono 64k, o tamanho do chunk depende da DURAÇÃO, não do arquivo de
 * entrada. Uma call de 200MB+ é só uma call longa/alto-bitrate; cada chunk sai
 * pequeno e bem abaixo do limite do Whisper, independente da origem.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import { chunkAudio } from '@/lib/services/audio-chunker'

const FFMPEG = ffmpegStatic as unknown as string
const WHISPER_LIMIT_BYTES = 25 * 1024 * 1024
const MB = 1024 * 1024

let workDir: string

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'amchunk-test-'))
})

afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {})
})

/**
 * Gera um tom senoidal de `seconds` segundos. PCM stereo (codec padrão) gera
 * arquivos grandes rápido — usado pra "pesar" a entrada além de 200MB sem
 * depender de um asset real no repo.
 */
function generateSine(
  outPath: string,
  seconds: number,
  opts: { codec?: string; sampleRate?: number; channels?: number } = {},
): void {
  const { codec = 'pcm_s16le', sampleRate = 44100, channels = 2 } = opts
  const res = spawnSync(
    FFMPEG,
    [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', `sine=frequency=440:duration=${seconds}`,
      '-ac', String(channels),
      '-ar', String(sampleRate),
      '-c:a', codec,
      '-y', outPath,
    ],
    { maxBuffer: 1024 * 1024 },
  )
  if (res.status !== 0) {
    throw new Error(`ffmpeg gen falhou (${res.status}): ${res.stderr?.toString() ?? ''}`)
  }
}

describe('chunkAudio', () => {
  it('corta uma call curta em janelas sobrepostas e bem formadas', async () => {
    const src = join(workDir, 'short.wav')
    generateSine(src, 25) // 25s
    const buffer = await readFile(src)

    const chunks = await chunkAudio(buffer, {
      chunkLenMs: 10_000, // janelas de 10s
      overlapMs: 2_000, // overlap de 2s
      maxChunks: 10,
    })

    // 25s / 10s = 3 janelas: [0,12s] [10s,22s] [20s,25s]
    expect(chunks).toHaveLength(3)

    // Índices e janelas de tempo corretas.
    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2])
    expect(chunks.map((c) => c.startMs)).toEqual([0, 10_000, 20_000])
    expect(chunks[2].endMs).toBe(25_000) // clampado na duração total

    // Overlap: 0 no primeiro, 2s nos demais (cabeça duplica a cauda anterior).
    expect(chunks[0].overlapMs).toBe(0)
    expect(chunks[1].overlapMs).toBe(2_000)
    expect(chunks[2].overlapMs).toBe(2_000)

    // Cada chunk é um mp3 não-vazio e pequeno.
    for (const c of chunks) {
      expect(c.mimeType).toBe('audio/mpeg')
      expect(c.buffer.length).toBeGreaterThan(0)
      expect(c.buffer.length).toBeLessThan(WHISPER_LIMIT_BYTES)
    }
  })

  it('aborta se o áudio gerar mais chunks que o teto (maxChunks)', async () => {
    const src = join(workDir, 'cap.wav')
    generateSine(src, 25)
    const buffer = await readFile(src)

    // 25s / 5s = 5 janelas > teto de 2 → erro.
    await expect(
      chunkAudio(buffer, { chunkLenMs: 5_000, overlapMs: 1_000, maxChunks: 2 }),
    ).rejects.toThrow(/teto/)
  })

  it(
    'call >200MB: produz chunks pequenos, todos abaixo do limite do Whisper',
    async () => {
      // ~21min de PCM stereo 44.1kHz/16-bit ≈ 212MB — passa de 200MB.
      const src = join(workDir, 'huge.wav')
      generateSine(src, 1_260)
      const buffer = await readFile(src)

      // Confirma que a ENTRADA realmente passa de 200MB.
      expect(buffer.length).toBeGreaterThan(200 * MB)

      const chunks = await chunkAudio(buffer) // opções default (10min / 10s)

      // 1260s / 600s = 3 janelas.
      expect(chunks).toHaveLength(3)
      expect(chunks[0].overlapMs).toBe(0)
      expect(chunks[1].overlapMs).toBe(10_000)

      // O essencial: apesar da entrada de 200MB+, CADA chunk sai pequeno e
      // dentro do limite do Whisper (a transcodificação desacopla tamanho da
      // origem).
      for (const c of chunks) {
        expect(c.buffer.length).toBeGreaterThan(0)
        expect(c.buffer.length).toBeLessThan(WHISPER_LIMIT_BYTES)
      }

      // Sanidade extra: o maior chunk é uma fração mínima da entrada original.
      const largest = Math.max(...chunks.map((c) => c.buffer.length))
      expect(largest).toBeLessThan(buffer.length / 10)
    },
    120_000, // timeout: gera + transcoda ~212MB
  )
})
