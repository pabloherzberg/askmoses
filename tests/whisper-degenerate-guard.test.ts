/**
 * Guard de saída degenerada do Whisper
 *
 * Contexto: entre junho e setembro de 2026, 30 calls ficaram com a transcrição
 * substituída pelo DEFAULT_PROMPT repetido dezenas de vezes. O `prompt` do
 * Whisper não é instrução — é condicionamento —, e sem fala competindo no áudio
 * a continuação mais provável daqueles tokens é o próprio prompt. A API devolve
 * 200 com texto bem formado, então nada no pipeline percebia.
 *
 * A causa saiu (não enviamos mais prompt por padrão). Este arquivo cobre a
 * detecção, que protege contra alucinação de qualquer origem.
 */

import { describe, it, expect } from 'vitest'
import {
  degenerateStats,
  isDegenerateTranscript,
} from '@/lib/services/whisper'

// O payload real, como apareceu no banco.
const PROMPT =
  'This is a sales call between a salesperson and a prospect. Provide a clean, natural English translation of the call.'

// ⚠️ LEIA ANTES DE AFROUXAR O LIMIAR.
//
// A primeira versao deste fixture reciclava dez frases sessenta vezes e o guard
// a marcou como degenerada. A conclusao certa foi corrigir o FIXTURE, nao o
// corte: conversa real quase nao repete sentenca INTEIRA — e e exatamente essa
// a premissa da metrica. Dez frases em sessenta turnos nao e conversa, e
// repeticao.
//
// Se um teste novo "falhar injustamente" aqui, a primeira pergunta e se o texto
// de exemplo parece transcricao de verdade. Baixar DEGENERATE_SENTENCE_RATIO
// para fazer um fixture artificial passar cega o guard no caso real.
//
// O fixture abaixo recicla ESTRUTURA e varia CONTEUDO, que e o que uma call de
// descoberta faz de fato.
function conversaReal(turnos: number): string {
  const aberturas = [
    'So tell me what is going on with',
    'And how long has it been happening with',
    'What have you already tried with',
    'Walk me through a typical walk with',
    'How does your family handle',
  ]
  const assuntos = [
    'the leash pulling', 'the lunging at other dogs', 'the barking at the door',
    'the jumping on guests', 'the recall in the yard', 'the crate at night',
  ]
  const caudas = [
    'on a normal weekday', 'when the kids are home', 'in the mornings',
    'around the neighbours', 'after work', 'on the weekend',
  ]
  return Array.from({ length: turnos }, (_, i) =>
    `${aberturas[i % aberturas.length]} ${assuntos[i % assuntos.length]} ${caudas[i % caudas.length]}, turn ${i}.`,
  ).join(' ')
}

// ─── degenerateStats ─────────────────────────────────────────────────────────

describe('degenerateStats', () => {
  it('conta sentenças únicas sobre o total', () => {
    const s = degenerateStats('One two three four. One two three four. Five six seven eight.')
    expect(s.sentences).toBe(3)
    expect(s.unique).toBe(2)
    expect(s.ratio).toBeCloseTo(0.667, 2)
  })

  it('texto vazio devolve ratio null, nao zero', () => {
    // null = "nao da pra medir". Zero seria uma medicao, e errada.
    expect(degenerateStats('').ratio).toBeNull()
    expect(degenerateStats('   \n  ').ratio).toBeNull()
  })

  it('ignora fragmento curto — conversa real repete "yeah" e "mm-hmm" a vontade', () => {
    const s = degenerateStats('Yeah. Yeah. Okay. Right. Mm-hmm. Yeah.')
    expect(s.sentences).toBe(0)
    expect(s.ratio).toBeNull()
  })

  it('normaliza espaco e caixa antes de comparar', () => {
    const s = degenerateStats('The dog pulls on the leash.  the   DOG pulls on the leash.')
    expect(s.unique).toBe(1)
  })
})

// ─── isDegenerateTranscript ──────────────────────────────────────────────────

describe('isDegenerateTranscript › o caso real', () => {
  it('pega o DEFAULT_PROMPT repetido — o payload que corrompeu 30 calls', () => {
    expect(isDegenerateTranscript(Array(40).fill(PROMPT).join(' '))).toBe(true)
  })

  it('pega mesmo com poucas repeticoes, desde que haja amostra', () => {
    expect(isDegenerateTranscript(Array(5).fill(PROMPT).join(' '))).toBe(true)
  })

  it('pega alucinacao de outra origem — nao e casado com o prompt antigo', () => {
    const outra = Array(30).fill('Thank you for watching this video.').join(' ')
    expect(isDegenerateTranscript(outra)).toBe(true)
  })
})

describe('isDegenerateTranscript › nao descarta transcricao legitima', () => {
  it('conversa real passa', () => {
    expect(isDegenerateTranscript(conversaReal(60))).toBe(false)
  })

  it('conversa curta passa', () => {
    expect(isDegenerateTranscript(conversaReal(10))).toBe(false)
  })

  it('conversa com repeticao natural passa — rep reformula a mesma pergunta', () => {
    const t = conversaReal(30) + ' Does that make sense? ' + conversaReal(20) + ' Does that make sense?'
    expect(isDegenerateTranscript(t)).toBe(false)
  })

  it('vazio NAO e degenerado — e ausencia, tratada pelo caller', () => {
    expect(isDegenerateTranscript('')).toBe(false)
  })
})

describe('isDegenerateTranscript › amostra insuficiente', () => {
  it('abaixo do minimo de sentencas nao julga, mesmo com tudo repetido', () => {
    // 3 sentencas identicas: a razao seria 0.33, mas 3 e ruido. Um chunk curto
    // legitimo pode ter uma frase repetida; derrubar por isso e pior.
    const t = Array(3).fill('The dog pulls on the leash constantly.').join(' ')
    expect(degenerateStats(t).sentences).toBe(3)
    expect(isDegenerateTranscript(t)).toBe(false)
  })

  it('a partir do minimo, julga', () => {
    const t = Array(6).fill('The dog pulls on the leash constantly.').join(' ')
    expect(isDegenerateTranscript(t)).toBe(true)
  })
})

// ─── Contrato do modulo ──────────────────────────────────────────────────────

describe('Contrato › o prompt nao volta por default', () => {
  it('o DEFAULT_PROMPT nao existe mais como constante', async () => {
    const { readFileSync } = await import('fs')
    const { resolve } = await import('path')
    const code = readFileSync(resolve(__dirname, '..', 'lib/services/whisper.ts'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')

    expect(code).not.toMatch(/DEFAULT_PROMPT/)
    // O campo só vai quando o caller pedir explicitamente.
    expect(code).toMatch(/if \(options\.prompt\) form\.append\("prompt", options\.prompt\)/)
  })

  it('o guard roda antes da diarizacao — nao paga LLM por lixo', async () => {
    const { readFileSync } = await import('fs')
    const { resolve } = await import('path')
    const code = readFileSync(resolve(__dirname, '..', 'lib/services/whisper.ts'), 'utf-8')
    const guard = code.indexOf('isDegenerateTranscript(raw)')
    const diarize = code.indexOf('assignSpeakerLabels(raw, options)')
    expect(guard).toBeGreaterThan(0)
    expect(diarize).toBeGreaterThan(guard)
  })
})
