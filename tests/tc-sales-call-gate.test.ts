/**
 * TC — Gate "isSalesCall" no pipeline de análise
 *
 * Dado que o pipeline de análise agora responde "é venda?" como primeira
 * pergunta, antes do restante da análise (rubrica, intent, detectedOutcome)
 * Quando o LLM retorna um payload JSON válido/inválido/malformado
 * Então isSalesCall deve ser extraído como boolean, com fallback fail-open
 * (default true) quando ausente ou de tipo inválido — consistente com a
 * regra "when in doubt, prefer true" descrita no prompt.
 *
 * Estratégia: replica a lógica de parsing de isSalesCall (idêntica em
 * lib/services/scoring.ts e app/api/analyze/route.ts) inline, sem importar
 * os módulos reais — evita puxar side-effects (createAdminClient, env vars).
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = resolve(__dirname, '..')
const scoringSource = readFileSync(resolve(ROOT, 'lib/services/scoring.ts'), 'utf-8')
const analyzeRoute = readFileSync(resolve(ROOT, 'app/api/analyze/route.ts'), 'utf-8')
const ghlScoringSource = readFileSync(resolve(ROOT, 'lib/services/ghl-call-scoring.ts'), 'utf-8')

// Replica a extração de isSalesCall feita em validateAnalysis() nos dois
// arquivos (mesma expressão nos dois: default true em ausente/malformado).
function extractIsSalesCall(obj: Record<string, unknown>): boolean {
  return typeof obj.isSalesCall === 'boolean' ? obj.isSalesCall : true
}

describe('isSalesCall gate — extração/validação', () => {
  it('aceita true explícito', () => {
    expect(extractIsSalesCall({ isSalesCall: true })).toBe(true)
  })

  it('aceita false explícito', () => {
    expect(extractIsSalesCall({ isSalesCall: false })).toBe(false)
  })

  it('default true quando campo ausente (fail-open)', () => {
    expect(extractIsSalesCall({})).toBe(true)
  })

  it('default true quando campo é string em vez de boolean', () => {
    expect(extractIsSalesCall({ isSalesCall: 'false' })).toBe(true)
  })

  it('default true quando campo é null', () => {
    expect(extractIsSalesCall({ isSalesCall: null })).toBe(true)
  })

  it('default true quando campo é número', () => {
    expect(extractIsSalesCall({ isSalesCall: 0 })).toBe(true)
  })
})

describe('isSalesCall — presença no prompt e no schema de saída (scoring.ts)', () => {
  it('buildDefaultSystemPrompt contém a seção SALES CALL GATE', () => {
    expect(scoringSource).toMatch(/SALES CALL GATE — CRITICAL FIRST CHECK/)
  })

  it('buildCotPrompt inclui isSalesCall como campo do JSON de saída', () => {
    expect(scoringSource).toMatch(/"isSalesCall":\s*<true\|false/)
  })

  it('validateAnalysis faz parsing de isSalesCall com fallback true', () => {
    expect(scoringSource).toMatch(/isSalesCall:\s*typeof obj\.isSalesCall === "boolean" \? obj\.isSalesCall : true/)
  })

  it('ScoreTranscriptResult expõe isSalesCall', () => {
    const ifaceStart = scoringSource.indexOf('export interface ScoreTranscriptResult')
    const ifaceEnd = scoringSource.indexOf('\n}', ifaceStart)
    const ifaceBody = scoringSource.slice(ifaceStart, ifaceEnd)
    expect(ifaceBody).toMatch(/isSalesCall:\s*boolean/)
  })
})

describe('isSalesCall — presença no prompt e no schema de saída (analyze/route.ts)', () => {
  it('buildDefaultSystemPrompt contém a seção SALES CALL GATE', () => {
    expect(analyzeRoute).toMatch(/SALES CALL GATE — CRITICAL FIRST CHECK/)
  })

  it('buildCotPrompt inclui isSalesCall como campo do JSON de saída', () => {
    expect(analyzeRoute).toMatch(/"isSalesCall":\s*<true\|false/)
  })

  it('validateAnalysis faz parsing de isSalesCall com fallback true', () => {
    expect(analyzeRoute).toMatch(/isSalesCall:\s*\n?\s*typeof obj\.isSalesCall === "boolean" \? obj\.isSalesCall : true/)
  })
})

describe('isSalesCall — gate de negócio branch (ghl-call-scoring.ts)', () => {
  it('runGhlCallScoring checa result.isSalesCall antes de rodar intent/rubrica', () => {
    expect(ghlScoringSource).toMatch(/if \(!result\.isSalesCall\)/)
  })

  it('branch de gate zera overallScore/detectedOutcome/sections/strengths/improvements', () => {
    const gateStart = ghlScoringSource.indexOf('if (!result.isSalesCall)')
    const gateEnd = ghlScoringSource.indexOf('\n    }', gateStart)
    const gateBody = ghlScoringSource.slice(gateStart, gateEnd)
    expect(gateBody).toMatch(/overallScore:\s*null/)
    expect(gateBody).toMatch(/detectedOutcome:\s*null/)
    expect(gateBody).toMatch(/sections:\s*null/)
    expect(gateBody).toMatch(/strengths:\s*null/)
    expect(gateBody).toMatch(/improvements:\s*null/)
  })

  it('branch de gate ainda chama recordLlmUsage (custo sempre registrado)', () => {
    const gateStart = ghlScoringSource.indexOf('if (!result.isSalesCall)')
    const gateEnd = ghlScoringSource.indexOf('\n    }', gateStart)
    const gateBody = ghlScoringSource.slice(gateStart, gateEnd)
    expect(gateBody).toMatch(/recordLlmUsage/)
  })
})

describe('isSalesCall — gate de negócio branch (analyze/route.ts)', () => {
  it('POST checa parsed.isSalesCall antes de rodar intent scoring', () => {
    expect(analyzeRoute).toMatch(/if \(!parsed\.isSalesCall\)/)
  })

  it('branch de gate persiste isSalesCall: false via dbCreateCall', () => {
    const gateStart = analyzeRoute.indexOf('if (!parsed.isSalesCall)')
    const gateEnd = analyzeRoute.indexOf('\n    }', gateStart)
    const gateBody = analyzeRoute.slice(gateStart, gateEnd)
    expect(gateBody).toMatch(/isSalesCall:\s*false/)
  })

  it('branch de gate ainda chama recordLlmUsage (custo sempre registrado)', () => {
    const gateStart = analyzeRoute.indexOf('if (!parsed.isSalesCall)')
    const gateEnd = analyzeRoute.indexOf('\n    }', gateStart)
    const gateBody = analyzeRoute.slice(gateStart, gateEnd)
    expect(gateBody).toMatch(/recordLlmUsage/)
  })
})
