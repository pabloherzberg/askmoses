import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import ffmpegStatic from 'ffmpeg-static'

// ────────────────────────────────────────────────────────────────────────────
// Audio chunker (Fase 2 do pipeline de calls).
//
// Corta um áudio grande em janelas SOBREPOSTAS pequenas, prontas pro Whisper.
// Duas garantias:
//   1) Transcoda na hora do corte → mp3 mono 16kHz/64kbps. Isso encolhe
//      qualquer entrada (vídeo incluso) pra ~480KB/min, então cada janela de
//      10min fica em ~5MB — muito abaixo do limite de 25MB do Whisper,
//      independente do formato/bitrate de origem. Resolve a raiz do problema.
//   2) Overlap entre janelas consecutivas: a fala cortada no limite de uma
//      janela aparece inteira na vizinha. A consolidação (transcript-stitcher)
//      remove a duplicata depois.
//
// Áudio comprimido NÃO pode ser cortado por bytes — por isso ffmpeg corta por
// tempo. Roda no Node runtime (não edge); o binário vem do ffmpeg-static e é
// incluído no bundle via outputFileTracingIncludes (next.config.mjs).
// ────────────────────────────────────────────────────────────────────────────

const FFMPEG_PATH = ffmpegStatic as unknown as string

export interface ChunkOptions {
  /** Duração "núcleo" de cada chunk em ms (avanço entre janelas). */
  chunkLenMs: number
  /** Quanto cada janela estende além do núcleo, sobrepondo a próxima, em ms. */
  overlapMs: number
  /** Teto de segurança: aborta se o áudio gerar mais janelas que isso. */
  maxChunks: number
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  chunkLenMs: 10 * 60 * 1000, // 10 min
  overlapMs: 10 * 1000, // 10 s
  maxChunks: 72, // ~12h a 10min/chunk — bem acima de qualquer call real
}

export interface AudioChunk {
  chunkIndex: number
  /** Início da janela no áudio original (ms). */
  startMs: number
  /** Fim da janela no áudio original (ms), já clampado na duração total. */
  endMs: number
  /** Quanto a CABEÇA deste chunk duplica a CAUDA do anterior (ms). 0 no índice 0. */
  overlapMs: number
  /** mp3 transcodado, pronto pro Whisper. */
  buffer: Buffer
  mimeType: 'audio/mpeg'
}

/**
 * Corta `input` em janelas sobrepostas. Escreve a fonte num arquivo temporário
 * (ffmpeg precisa de input seekable pra -ss preciso), descobre a duração, e
 * extrai cada janela com um pass de ffmpeg. Limpa todos os temporários no fim,
 * inclusive em erro.
 *
 * Devolve os buffers em memória — o caller decide onde persistir (Storage).
 * O áudio original NÃO é mantido: vive só nesse arquivo temp e é apagado aqui.
 */
export async function chunkAudio(
  input: Buffer,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): Promise<AudioChunk[]> {
  if (!FFMPEG_PATH) {
    throw new Error('ffmpeg-static binary not found (FFMPEG_PATH vazio)')
  }

  const workDir = await mkdtemp(join(tmpdir(), 'amchunk-'))
  const srcPath = join(workDir, `src-${randomUUID()}.input`)

  try {
    await writeFile(srcPath, input)

    const totalMs = await probeDurationMs(srcPath)
    if (totalMs <= 0) {
      throw new Error('não foi possível determinar a duração do áudio')
    }

    const { chunkLenMs, overlapMs, maxChunks } = options
    const windowCount = Math.max(1, Math.ceil(totalMs / chunkLenMs))
    if (windowCount > maxChunks) {
      throw new Error(
        `áudio gera ${windowCount} chunks (> teto ${maxChunks}); ajuste chunkLenMs`,
      )
    }

    const chunks: AudioChunk[] = []
    for (let i = 0; i < windowCount; i++) {
      const startMs = i * chunkLenMs
      // Janela = núcleo + overlap, clampada na duração total.
      const endMs = Math.min(totalMs, startMs + chunkLenMs + overlapMs)
      const durationMs = endMs - startMs
      if (durationMs <= 0) break

      const outPath = join(workDir, `chunk-${i}.mp3`)
      await extractWindow(srcPath, outPath, startMs, durationMs)
      const buffer = await readFile(outPath)

      chunks.push({
        chunkIndex: i,
        startMs,
        endMs,
        overlapMs: i === 0 ? 0 : overlapMs,
        buffer,
        mimeType: 'audio/mpeg',
      })
    }

    return chunks
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Mede a duração real do áudio (ms) sem cortar: escreve um temp seekável e lê só
 * o header via ffmpeg (barato). Usada no ingest para backfill de duração quando
 * o GHL não a informou. Retorna 0 se não conseguir ler o header.
 */
export async function probeAudioDurationMs(input: Buffer): Promise<number> {
  if (!FFMPEG_PATH) {
    throw new Error('ffmpeg-static binary not found (FFMPEG_PATH vazio)')
  }
  const workDir = await mkdtemp(join(tmpdir(), 'amprobe-'))
  const srcPath = join(workDir, `src-${randomUUID()}.input`)
  try {
    await writeFile(srcPath, input)
    return await probeDurationMs(srcPath)
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Descobre a duração em ms parseando o stderr do ffmpeg. `ffmpeg -i src` sem
 * output sai com código 1 mas imprime "Duration: HH:MM:SS.cc" — barato, não
 * decodifica o áudio inteiro.
 */
async function probeDurationMs(srcPath: string): Promise<number> {
  const { stderr } = await runFfmpeg(['-i', srcPath], { allowFailure: true })
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/)
  if (!m) return 0
  const [, hh, mm, ss, cc] = m
  const centis = cc.padEnd(2, '0').slice(0, 2)
  return (
    Number(hh) * 3_600_000 +
    Number(mm) * 60_000 +
    Number(ss) * 1000 +
    Number(centis) * 10
  )
}

/**
 * Extrai [startMs, startMs+durationMs) transcodando pra mp3 mono 16kHz/64k.
 * `-ss` antes de `-i` = input seeking (rápido). 16kHz mono é o suficiente pra
 * voz (Whisper reamostra pra 16kHz de qualquer jeito) e minimiza o tamanho.
 */
async function extractWindow(
  srcPath: string,
  outPath: string,
  startMs: number,
  durationMs: number,
): Promise<void> {
  const args = [
    '-ss', msToTimecode(startMs),
    '-t', msToTimecode(durationMs),
    '-i', srcPath,
    '-vn', // descarta vídeo (entradas .mp4/.mov)
    '-ac', '1', // mono
    '-ar', '16000', // 16kHz
    '-b:a', '64k',
    '-f', 'mp3',
    '-y',
    outPath,
  ]
  await runFfmpeg(args)
}

function msToTimecode(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  const h = Math.floor(total / 3_600_000)
  const m = Math.floor((total % 3_600_000) / 60_000)
  const s = Math.floor((total % 60_000) / 1000)
  const millis = total % 1000
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(millis, 3)}`
}

interface RunOptions {
  allowFailure?: boolean
}

function runFfmpeg(
  args: string[],
  opts: RunOptions = {},
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => {
      // Limita o buffer de stderr — ffmpeg é verboso em arquivos longos.
      if (stderr.length < 64_000) stderr += d.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      const exit = code ?? 0
      if (exit !== 0 && !opts.allowFailure) {
        reject(new Error(`ffmpeg saiu com código ${exit}: ${stderr.slice(-2000)}`))
        return
      }
      resolve({ code: exit, stderr })
    })
  })
}
