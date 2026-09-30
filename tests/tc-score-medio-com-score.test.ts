/**
 * TC — Score médio só sobre calls com score válido
 *
 * Call sem score (overall_score NULL: falha de pipeline, em processamento)
 * entrava nas médias como 0 (`overall_score ?? 0` no syncTrainerStats,
 * `score: 0` no toCall). Em prod (30/09/2026): média das calls de venda
 * 53,4 → 60,1; Team Avg da K9 Activity Club 0,5 → 2,0.
 *
 * Regras (decisões A/B/C do PR):
 *   - média de score: só calls com score e scoring_status fora de
 *     scoring_failed/transcript_leaked (hasScore / hasScoreRow / avgScoreOf);
 *   - médias por seção: só calls com sections e scoring válido (hasRubric);
 *   - card Team Avg: só reps com score > 0 (rep só com calls sem score fica 0);
 *   - total_calls e close rate não mudam aqui.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avgScoreOf, hasRubric, hasScore, hasScoreRow } from '@/lib/sales-calls'
import { buildWeeklyTrend, buildPerCallTrend } from '@/lib/services/rubric'
import { avgRubricScores } from '@/lib/services/calls'
import type { Call, RubricScores } from '@/lib/types'

// rubric.ts e calls.ts importam getOrgId (lib/auth → Supabase server) e o
// tradutor; as funções testadas aqui são puras.
vi.mock('@/lib/auth', () => ({ getOrgId: async () => null }))
vi.mock('@/lib/i18n/translate-coaching', () => ({
  translateCall: async (c: unknown) => c,
  translateCalls: async (c: unknown) => c,
}))

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

// ─── Predicados ──────────────────────────────────────────────────────────────

describe('hasScore', () => {
  it('hasScore:false (overall_score NULL) → fora', () => {
    expect(hasScore({ hasScore: false })).toBe(false)
  })

  it('scoring_failed e transcript_leaked → fora, mesmo com score', () => {
    expect(hasScore({ hasScore: true, scoringStatus: 'scoring_failed' })).toBe(false)
    expect(hasScore({ hasScore: true, scoringStatus: 'transcript_leaked' })).toBe(false)
  })

  it('score com scoring_status ok ou NULL → dentro', () => {
    expect(hasScore({ hasScore: true, scoringStatus: 'ok' })).toBe(true)
    expect(hasScore({ hasScore: true, scoringStatus: null })).toBe(true)
  })

  it('undefined (Call montado fora do toCall, ex.: mock) → dentro', () => {
    expect(hasScore({})).toBe(true)
  })

  it('versão snake_case', () => {
    expect(hasScoreRow({ overall_score: null })).toBe(false)
    expect(hasScoreRow({})).toBe(false)
    expect(hasScoreRow({ overall_score: 0 })).toBe(true) // 0 avaliado é score
    expect(hasScoreRow({ overall_score: 80, scoring_status: 'scoring_failed' })).toBe(false)
    expect(hasScoreRow({ overall_score: 80, scoring_status: 'ok' })).toBe(true)
  })
})

describe('avgScoreOf', () => {
  it('ignora call sem score e scoring falho', () => {
    expect(
      avgScoreOf([
        { score: 80, hasScore: true },
        { score: 60, hasScore: true },
        { score: 0, hasScore: false },
        { score: 0, hasScore: true, scoringStatus: 'scoring_failed' },
      ]),
    ).toBe(70)
  })

  it('nenhuma com score → 0 (sem divisão por zero)', () => {
    expect(avgScoreOf([{ score: 0, hasScore: false }])).toBe(0)
    expect(avgScoreOf([])).toBe(0)
  })
})

describe('hasRubric', () => {
  it('sem sections → fora; com sections → dentro', () => {
    expect(hasRubric({ hasSections: false })).toBe(false)
    expect(hasRubric({ hasSections: true })).toBe(true)
  })

  it('scoring falho → fora (seções zeradas não são avaliação)', () => {
    expect(hasRubric({ hasSections: true, scoringStatus: 'scoring_failed' })).toBe(false)
  })

  it('undefined (mock) → dentro', () => {
    expect(hasRubric({})).toBe(true)
  })
})

// ─── avgRubricScores (decisão B) ─────────────────────────────────────────────

const rubric = (v: number): RubricScores => ({
  discovery: v,
  problemAgitation: v,
  offerPresentation: v,
  objectionHandling: v,
  closeAndNextSteps: v,
})

describe('avgRubricScores — só calls com sections', () => {
  it('call sem sections não puxa a média da seção pra baixo', () => {
    const calls = [
      { rubricScores: rubric(4), hasSections: true },
      { rubricScores: rubric(3), hasSections: true },
      { rubricScores: rubric(0), hasSections: false },
    ] as unknown as Call[]
    expect(avgRubricScores(calls).discovery).toBe(3.5)
  })

  it('só calls sem sections → zeros', () => {
    const calls = [{ rubricScores: rubric(0), hasSections: false }] as unknown as Call[]
    expect(avgRubricScores(calls)).toEqual(rubric(0))
  })
})

// ─── Tendências ──────────────────────────────────────────────────────────────

describe('tendências — score só com score', () => {
  it('buildWeeklyTrend: a call sem score não entra na média da semana', () => {
    const now = new Date().toISOString()
    const [week] = buildWeeklyTrend(
      [
        { date: now, score: 80, result: 'closed', hasOutcome: true, hasScore: true },
        { date: now, score: 60, result: 'not_closed', hasOutcome: true, hasScore: true },
        { date: now, score: 0, result: 'not_closed', hasOutcome: false, hasScore: false },
      ],
      1,
    )
    expect(week.score).toBe(70) // antes: 47
  })

  it('buildPerCallTrend: acumulado do trainer ignora call sem score', () => {
    const { trainer } = buildPerCallTrend([
      { date: '2026-09-01T10:00:00Z', score: 80, result: 'closed', hasScore: true },
      { date: '2026-09-02T10:00:00Z', score: 0, result: 'not_closed', hasScore: false },
      { date: '2026-09-03T10:00:00Z', score: 60, result: 'not_closed', hasScore: true },
    ])
    expect(trainer.map((p) => p.score)).toEqual([80, 80, 70])
  })

  it('buildPerCallTrend: time idem, e scoring_failed também fica fora', () => {
    const { team } = buildPerCallTrend(
      [{ date: '2026-09-03T10:00:00Z', score: 70, result: 'closed', hasScore: true }],
      [
        { date: '2026-09-01T10:00:00Z', score: 90, result: 'closed', hasScore: true },
        { date: '2026-09-02T10:00:00Z', score: 0, result: 'not_closed', hasScore: false },
        { date: '2026-09-02T11:00:00Z', score: 0, result: 'not_closed', hasScore: true, scoringStatus: 'scoring_failed' },
        { date: '2026-09-03T10:00:00Z', score: 50, result: 'not_closed', hasScore: true },
      ],
    )
    expect(team[0].score).toBe(70)
  })
})

// ─── Contratos ───────────────────────────────────────────────────────────────

describe('contratos — cada média de score usa a regra nova', () => {
  it('toCall preenche hasScore, hasSections e scoringStatus', () => {
    const s = src('lib/services/calls.ts')
    expect(s).toMatch(/hasScore:\s*db\.overall_score\s*!=\s*null/)
    expect(s).toMatch(/hasSections:\s*Array\.isArray\(db\.sections\)/)
    expect(s).toMatch(/scoringStatus:\s*db\.scoring_status/)
  })

  it('syncTrainerStats: score e delta com hasScoreRow; total_calls sobre todas', () => {
    const s = src('lib/db/trainers.ts')
    expect(s).toMatch(/const scored = calls\.filter\(hasScoreRow\)/)
    expect(s).toMatch(/recentCalls\.filter\(hasScoreRow\)/)
    expect(s).toMatch(/olderCalls\.filter\(hasScoreRow\)/)
    expect(s).not.toMatch(/overall_score \?\? 0/)
    expect(s).toMatch(/total_calls: total/)
    expect(s).toMatch(/excludeFailedScoring\(/)
  })

  it('card Team Avg do dashboard: só reps com score > 0 (decisão A)', () => {
    const s = src('app/[locale]/dashboard/page.tsx')
    expect(s).toMatch(/ratedTrainers\.filter\(\(tr\) => tr\.score > 0\)/)
    expect(s).toMatch(/scoredTrainers\.reduce/)
  })

  it('coaching (Team Command Center + recomendações) usa avgScoreOf', () => {
    expect((src('lib/services/coaching.ts').match(/avgScoreOf\(/g) ?? []).length).toBe(2)
  })

  it('/me: score total, bucket (scored) e janela ponderada por scored', () => {
    const page = src('app/[locale]/(trainer)/me/page.tsx')
    expect(page).toMatch(/totalAvgScore = Math\.round\(avgScoreOf\(trainerCalls\)\)/)
    expect(page).toMatch(/scored: inWeek\.filter\(hasScore\)\.length/)
    const strip = src('app/[locale]/(trainer)/me/TrainerKpiStrip.tsx')
    expect(strip).toMatch(/b\.score \* b\.scored/)
  })

  it('analytics: tendência, seções, Master Coach, Rising Star e média geral', () => {
    const s = src('app/[locale]/dashboard/analytics/page.tsx')
    expect(s).toMatch(/if \(hasScore\(call\)\)/)
    expect(s).toMatch(/sorted\.filter\(hasRubric\)\.forEach/)
    expect(s).toMatch(/const scoredCalls = sorted\.filter\(hasScore\)/)
    expect(s).toMatch(/recent = scoredCalls\.slice/)
    expect(s).toMatch(/avgScoreOf\(scoredCalls\)/)
  })

  it('insights: revenue leak agrupa só calls com sections', () => {
    const s = src('lib/services/insights.ts')
    expect(s).toMatch(/const ratedCalls = calls\.filter\(hasRubric\)/)
    expect(s).toMatch(/callsWithLow = ratedCalls\.filter/)
  })

  it('nenhuma média de score volta a somar c.score direto sobre a lista inteira', () => {
    for (const p of [
      'lib/services/coaching.ts',
      'lib/services/rubric.ts',
      'app/[locale]/(trainer)/me/page.tsx',
    ]) {
      expect(src(p), p).not.toMatch(/reduce\(\(s(um)?, c\) => s(um)? \+ \(?c\.score/)
    }
  })
})

describe('efeitos colaterais que NÃO podem acontecer', () => {
  it('close rate e total_calls não mudam aqui', () => {
    const s = src('lib/db/trainers.ts')
    expect(s).toMatch(/const decided = calls\.filter\(hasOutcomeRow\)/)
    expect(s).toMatch(/const total = calls\.length/)
  })

  it('Perfect Calls continua contando score >= limiar (não é média)', () => {
    expect(src('app/[locale]/dashboard/analytics/page.tsx')).toMatch(/call\.score >= PERFECT_CALL_THRESHOLD/)
  })
})
