// ────────────────────────────────────────────────────────────────────────────
// Costura de transcripts parciais (Fase 3 do pipeline de calls).
//
// Os chunks são cortados COM overlap (audio-chunker), então a fala do limite
// aparece tanto na cauda de um chunk quanto na cabeça do próximo. Aqui
// remontamos o transcript completo removendo a duplicata da junção.
//
// O endpoint de translations do Whisper devolve texto puro (sem timestamps),
// então não dá pra cortar pelo tempo. Em vez disso, alinhamos por TEXTO:
// achamos o maior trecho de palavras em que a cauda do acumulado == a cabeça
// do próximo chunk (comparação normalizada) e descartamos esse trecho do
// próximo. É heurístico — o overlap dá margem de sobra (~10s) pra um match
// confiável; quando não há match (Whisper transcreveu o limite diferente),
// caímos pra concatenação simples (pode sobrar uma pequena duplicata, aceitável
// e ajustável depois).
// ────────────────────────────────────────────────────────────────────────────

export interface StitchableChunk {
  chunkIndex: number
  transcript: string | null
  /** Overlap (ms) que a cabeça deste chunk duplica do anterior. 0 no índice 0. */
  overlapMs: number
}

// Estimativa de fala: ~3 palavras/seg. Usado pra dimensionar a janela de busca
// do overlap a partir do overlapMs, com folga generosa.
const WORDS_PER_SEC = 3
const MIN_OVERLAP_WORDS = 4
const MAX_OVERLAP_WORDS = 120

interface Token {
  /** Forma normalizada (lowercase, sem pontuação) pra comparação. */
  norm: string
  /** Forma original preservada pra saída. */
  raw: string
}

function tokenize(text: string): Token[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, norm: raw.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') }))
    .filter((t) => t.norm.length > 0)
}

/**
 * Quantas palavras da cabeça de `next` duplicam a cauda de `prev`. Procura do
 * maior overlap plausível pra baixo e retorna o primeiro match — o maior trecho
 * sobreposto. 0 se não achar nada confiável.
 */
function findOverlapWords(
  prev: Token[],
  next: Token[],
  overlapMs: number,
): number {
  const expected = Math.ceil((overlapMs / 1000) * WORDS_PER_SEC)
  const window = Math.min(
    MAX_OVERLAP_WORDS,
    Math.max(MIN_OVERLAP_WORDS, expected * 2),
    prev.length,
    next.length,
  )

  for (let o = window; o >= MIN_OVERLAP_WORDS; o--) {
    let match = true
    for (let k = 0; k < o; k++) {
      if (prev[prev.length - o + k].norm !== next[k].norm) {
        match = false
        break
      }
    }
    if (match) return o
  }
  return 0
}

/**
 * Remonta o transcript completo a partir dos chunks transcritos. Ordena por
 * chunk_index, ignora chunks sem texto, e remove a duplicata do overlap em cada
 * junção. Retorna o texto consolidado (sem speaker labels — a diarização roda
 * depois, sobre este texto inteiro).
 */
export function stitchChunkTranscripts(chunks: StitchableChunk[]): string {
  const ordered = [...chunks]
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .filter((c) => c.transcript && c.transcript.trim().length > 0)

  if (ordered.length === 0) return ''
  if (ordered.length === 1) return ordered[0].transcript!.trim()

  let acc = tokenize(ordered[0].transcript!)

  for (let i = 1; i < ordered.length; i++) {
    const next = tokenize(ordered[i].transcript!)
    if (next.length === 0) continue

    // overlapMs===0 (não deveria pra i>0, mas defensivo) → sem dedup.
    const overlap = ordered[i].overlapMs > 0
      ? findOverlapWords(acc, next, ordered[i].overlapMs)
      : 0

    acc = acc.concat(next.slice(overlap))
  }

  return acc.map((t) => t.raw).join(' ')
}
