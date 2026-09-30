/**
 * TC — Close rate só sobre calls de venda COM resultado
 *
 * Call sem resultado (call_outcome NULL: no_recording, transcription_failed,
 * presa em status intermediário ou ainda no pipeline) entrava no denominador
 * como "não fechou". Em prod (30/09/2026) isso derrubava o close rate agregado
 * de 50,7% para 45,1%, e o de uma org de 52,9% para 11,7%.
 *
 * A regra: denominador = venda (is_sales_call IS DISTINCT FROM false) E
 * call_outcome IS NOT NULL. Só no CÁLCULO do close rate — contagem de calls,
 * score e billing continuam sobre todas as calls de venda.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applySalesCallOnly,
  applySalesCallWithOutcome,
  closeRateOf,
  hasOutcome,
  hasOutcomeRow,
} from '@/lib/sales-calls'
import { buildWeeklyTrend, buildPerCallTrend } from '@/lib/services/rubric'

// rubric.ts importa getOrgId (lib/auth → Supabase server). As funções de
// tendência testadas aqui são puras; o mock (içado pelo vitest acima dos
// imports) só evita carregar o client.
vi.mock('@/lib/auth', () => ({ getOrgId: async () => null }))
vi.mock('@/lib/services/calls', () => ({ getCalls: async () => [] }))

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

// ─── Predicados ──────────────────────────────────────────────────────────────

describe('hasOutcome / hasOutcomeRow', () => {
  it('hasOutcome:false (call_outcome NULL no banco) → fora do close rate', () => {
    expect(hasOutcome({ hasOutcome: false })).toBe(false)
  })

  it('hasOutcome:true → dentro', () => {
    expect(hasOutcome({ hasOutcome: true })).toBe(true)
  })

  it('undefined (Call montado fora do toCall, ex.: mock) → dentro', () => {
    expect(hasOutcome({})).toBe(true)
  })

  it('versão snake_case: só call_outcome NULL/undefined fica fora', () => {
    expect(hasOutcomeRow({ call_outcome: null })).toBe(false)
    expect(hasOutcomeRow({})).toBe(false)
    expect(hasOutcomeRow({ call_outcome: 'closed' })).toBe(true)
    expect(hasOutcomeRow({ call_outcome: 'not_closed' })).toBe(true)
  })
})

describe('applySalesCallWithOutcome — filtro no query builder', () => {
  it('aplica o filtro de venda E call_outcome IS NOT NULL', () => {
    const calls: unknown[][] = []
    const fake = {
      not(column: string, operator: string, value: unknown) {
        calls.push([column, operator, value])
        return this
      },
    }
    applySalesCallWithOutcome(fake)
    expect(calls).toEqual([
      ['is_sales_call', 'is', false],
      ['call_outcome', 'is', null],
    ])
  })

  it('call legada (is_sales_call NULL) com resultado continua contando', () => {
    // `not.is.false` mantém NULL; o filtro novo só olha call_outcome.
    const row = { is_sales_call: null, call_outcome: 'closed' }
    expect(row.is_sales_call !== false && hasOutcomeRow(row)).toBe(true)
  })
})

// ─── closeRateOf ─────────────────────────────────────────────────────────────

const closed = { result: 'closed', hasOutcome: true }
const notClosed = { result: 'not_closed', hasOutcome: true }
const semResultado = { result: 'not_closed', hasOutcome: false }

describe('closeRateOf', () => {
  it('ignora call sem resultado no denominador', () => {
    // 1 closed + 1 not_closed + 2 sem resultado → 50%, não 25%.
    expect(closeRateOf([closed, notClosed, semResultado, semResultado])).toBe(50)
  })

  it('só calls sem resultado → 0 (sem divisão por zero)', () => {
    expect(closeRateOf([semResultado, semResultado])).toBe(0)
  })

  it('lista vazia → 0', () => {
    expect(closeRateOf([])).toBe(0)
  })

  it('reproduz o caso de prod: 9 closed em 17 com resultado + 60 sem resultado', () => {
    const calls = [
      ...Array.from({ length: 9 }, () => closed),
      ...Array.from({ length: 8 }, () => notClosed),
      ...Array.from({ length: 60 }, () => semResultado),
    ]
    expect(closeRateOf(calls)).toBe(53) // antes: 9/77 = 12%
  })
})

// ─── Tendências ──────────────────────────────────────────────────────────────

describe('buildWeeklyTrend — close rate da semana só com resultado', () => {
  it('semana com falhas de pipeline não derruba o close rate', () => {
    const now = new Date().toISOString()
    const trend = buildWeeklyTrend(
      [
        { date: now, score: 80, result: 'closed', hasOutcome: true },
        { date: now, score: 60, result: 'not_closed', hasOutcome: true },
        { date: now, score: 0, result: 'not_closed', hasOutcome: false },
      ],
      1,
    )
    expect(trend).toHaveLength(1)
    expect(trend[0].closeRate).toBe(50)
    // O score da semana é coberto em tc-score-medio-com-score.test.ts.
  })
})

describe('buildPerCallTrend — acumulado só com resultado', () => {
  it('trainer: a call sem resultado não entra no denominador acumulado', () => {
    const { trainer } = buildPerCallTrend([
      { date: '2026-09-01T10:00:00Z', score: 80, result: 'closed', hasOutcome: true },
      { date: '2026-09-02T10:00:00Z', score: 0, result: 'not_closed', hasOutcome: false },
      { date: '2026-09-03T10:00:00Z', score: 60, result: 'not_closed', hasOutcome: true },
    ])
    expect(trainer.map((p) => p.closeRate)).toEqual([100, 100, 50])
  })

  it('primeira call sem resultado → close rate 0 até existir uma com resultado', () => {
    const { trainer } = buildPerCallTrend([
      { date: '2026-09-01T10:00:00Z', score: 0, result: 'not_closed', hasOutcome: false },
      { date: '2026-09-02T10:00:00Z', score: 80, result: 'closed', hasOutcome: true },
    ])
    expect(trainer.map((p) => p.closeRate)).toEqual([0, 100])
  })

  it('time: mesmo denominador', () => {
    const { team } = buildPerCallTrend(
      [{ date: '2026-09-03T10:00:00Z', score: 70, result: 'closed', hasOutcome: true }],
      [
        { date: '2026-09-01T10:00:00Z', score: 80, result: 'closed', hasOutcome: true },
        { date: '2026-09-02T10:00:00Z', score: 0, result: 'not_closed', hasOutcome: false },
        { date: '2026-09-03T10:00:00Z', score: 60, result: 'not_closed', hasOutcome: true },
      ],
    )
    expect(team[0].closeRate).toBe(50)
  })
})

// ─── Contratos: cada ponto de cálculo usa a regra nova ───────────────────────

describe('contratos — close rate usa só calls com resultado', () => {
  it('toCall marca hasOutcome a partir de call_outcome', () => {
    expect(src('lib/services/calls.ts')).toMatch(/hasOutcome:\s*db\.call_outcome\s*!=\s*null/)
  })

  it('syncTrainerStats: close rate e delta com hasOutcomeRow; total_calls sobre todas', () => {
    const s = src('lib/db/trainers.ts')
    expect(s).toMatch(/const decided = calls\.filter\(hasOutcomeRow\)/)
    expect(s).toMatch(/recentCalls\.filter\(hasOutcomeRow\)/)
    expect(s).toMatch(/olderCalls\.filter\(hasOutcomeRow\)/)
    expect(s).toMatch(/const total = calls\.length/)
    expect(s).toMatch(/total_calls: total/)
  })

  it('Team Command Center e recomendações de coaching usam closeRateOf', () => {
    const s = src('lib/services/coaching.ts')
    expect((s.match(/closeRateOf\(/g) ?? []).length).toBe(2)
  })

  it('/me: close rate total, bucket semanal e "Not closed" só com resultado', () => {
    const page = src('app/[locale]/(trainer)/me/page.tsx')
    expect(page).toMatch(/totalCloseRate = closeRateOf\(trainerCalls\)/)
    expect(page).toMatch(/decided: inWeek\.filter\(hasOutcome\)\.length/)
    expect(page).toMatch(/hasOutcome\(c\) && c\.result === "not_closed"/)
    const strip = src('app/[locale]/(trainer)/me/TrainerKpiStrip.tsx')
    expect(strip).toMatch(/winsSum \/ decidedSum/)
  })

  it('/dashboard/analytics: breakdown e leaderboard só com resultado', () => {
    const s = src('app/[locale]/dashboard/analytics/page.tsx')
    expect(s).toMatch(/const decided = sorted\.filter\(hasOutcome\)/)
    expect(s).toMatch(/decided\.forEach\(/)
  })

  it('insights: revenue leak, at-risk e generateInsights com closeRateOf', () => {
    const s = src('lib/services/insights.ts')
    expect((s.match(/closeRateOf\(/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('coaching, insights e rubric não contam closed à mão (era closed.length / calls.length)', () => {
    // Antes da correção: 2, 3 e 1 ocorrências. Todo close rate desses arquivos
    // passa por closeRateOf/hasOutcome. (/me e analytics ainda contam wins e
    // closed para exibição — lá o contrato está nos testes acima.)
    for (const p of ['lib/services/coaching.ts', 'lib/services/insights.ts', 'lib/services/rubric.ts']) {
      expect(src(p), p).not.toMatch(/result === ["']closed["']\)\.length/)
    }
  })
})

describe('efeitos colaterais que NÃO podem acontecer', () => {
  it('billing continua em applySalesCallOnly (call sem resultado ainda é faturável)', () => {
    const s = src('lib/db/billing.ts')
    expect(s).toMatch(/applySalesCallOnly\(/)
    expect(s).not.toMatch(/applySalesCallWithOutcome/)
  })

  it('applySalesCallOnly não mudou (contagem e score dependem dele)', () => {
    const calls: unknown[][] = []
    const fake = { not(c: string, o: string, v: unknown) { calls.push([c, o, v]); return this } }
    applySalesCallOnly(fake)
    expect(calls).toEqual([['is_sales_call', 'is', false]])
  })
})
