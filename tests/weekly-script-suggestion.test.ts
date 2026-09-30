/**
 * Sugestão semanal de script (GLOBAL) — seleção por org, diversidade,
 * exclusão de demo, pulo sem abortar, validação das 5 seções e registro da
 * rodada.
 *
 * Antes: as 5 calls de maior score da base inteira (na prática todas da org
 * de demonstração, score 98–99) geravam o script enviado às 21 orgs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import {
  selectWeeklyCalls,
  type WeeklyCandidateCall,
  type WeeklyOrg,
} from '@/lib/script-intelligence/weekly-selection'
import {
  WEEKLY_MAX_TRANSCRIPT_CHARS,
  WEEKLY_SECTION_NAMES,
  WEEKLY_SYSTEM_PROMPT,
  buildWeeklyUserPrompt,
  validateWeeklyScript,
} from '@/lib/script-intelligence/weekly-prompt'
import { SYSTEM_PROMPT } from '@/lib/script-intelligence/generate-script-prompt'

// ─── Fakes (Supabase encadeável, LLM, persistência) ──────────────────────────

type Result = { data: unknown; error: unknown }
interface Recorded { table: string; ops: Array<[string, unknown[]]> }

const db = vi.hoisted(() => ({
  results: {} as Record<string, Result | Result[]>,
  recorded: [] as Array<{ table: string; ops: Array<[string, unknown[]]> }>,
  inserts: [] as Array<{ table: string; row: unknown }>,
}))

function next(table: string): Result {
  const r = db.results[table]
  if (Array.isArray(r)) return r.shift() ?? { data: [], error: null }
  return r ?? { data: [], error: null }
}

function builder(table: string) {
  const rec: Recorded = { table, ops: [] }
  db.recorded.push(rec)
  const b: Record<string, unknown> = {}
  const chain = (name: string) => (...args: unknown[]) => {
    rec.ops.push([name, args])
    if (name === 'insert') db.inserts.push({ table, row: args[0] })
    return b
  }
  for (const m of ['select', 'eq', 'not', 'gte', 'is', 'in', 'order', 'range', 'limit', 'update', 'insert', 'upsert']) {
    b[m] = chain(m)
  }
  b.maybeSingle = async () => next(table)
  b.single = async () => next(table)
  b.then = (resolve: (r: Result) => unknown) => Promise.resolve(next(table)).then(resolve)
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))

const ai = vi.hoisted(() => ({ text: '', calls: 0 }))
vi.mock('ai', () => ({
  generateText: async () => {
    ai.calls += 1
    return { text: ai.text, usage: { inputTokens: 1000, outputTokens: 200 } }
  },
}))
vi.mock('@/lib/openai', () => ({ getOpenAIModel: () => ({}), resolveOpenAIModelId: (m: string) => m }))
vi.mock('@/lib/services/llm-usage', () => ({
  recordLlmUsage: async () => {},
  computeCostForModel: async () => 0.0012,
}))
const dbCreateScript = vi.hoisted(() => vi.fn(async () => ({ id: 'script-new' })))
vi.mock('@/lib/db/scripts', () => ({ dbCreateScript }))
const sendScriptToOrgs = vi.hoisted(() => vi.fn(async (p: { orgIds: string[] }) => ({ sentTo: p.orgIds.length })))
vi.mock('@/lib/services/send-script', () => ({ sendScriptToOrgs }))

import { fetchWeeklyCandidateCalls, generateWeeklySuggestedScript } from '@/lib/script-intelligence/weekly-suggestion'
import { GET } from '@/app/api/cron/weekly-script-suggestion/route'

beforeEach(() => {
  db.results = {}
  db.recorded = []
  db.inserts = []
  ai.text = ''
  ai.calls = 0
  dbCreateScript.mockClear()
  sendScriptToOrgs.mockClear()
})

// ─── Helpers de dados ────────────────────────────────────────────────────────

const LONG = 'x'.repeat(200)

function calls(orgId: string, scores: number[]): WeeklyCandidateCall[] {
  return scores.map((s, i) => ({
    id: `${orgId}-c${i}`,
    org_id: orgId,
    overall_score: s,
    transcript: LONG,
    created_at: `2026-09-${String(10 + i).padStart(2, '0')}T10:00:00Z`,
  }))
}

const org = (id: string, name: string, is_demo = false): WeeklyOrg => ({ id, name, is_demo })

const validScript = () => ({
  name: 'Winning Patterns Script',
  description: 'd',
  sections: WEEKLY_SECTION_NAMES.map((name, i) => ({
    name: name as string,
    instructions: `do ${i}`,
    tips: `tip ${i}`,
    weight: 20,
    critical: i < 2,
  })),
  full_script: 'full',
  explanation: 'e',
})

// ─── Seleção e diversidade ───────────────────────────────────────────────────

describe('selectWeeklyCalls — diversidade (3 por org)', () => {
  it('pega exatamente as 3 de maior score de cada org', () => {
    const r = selectWeeklyCalls([org('a', 'A')], calls('a', [70, 95, 80, 90, 60]))
    expect(r.included).toHaveLength(1)
    expect(r.included[0].calls.map((c) => c.overallScore)).toEqual([95, 90, 80])
  })

  it('org grande não domina: 50 calls de uma org e 3 de outra → 3 + 3', () => {
    const r = selectWeeklyCalls(
      [org('big', 'Big'), org('small', 'Small')],
      [...calls('big', Array.from({ length: 50 }, (_, i) => 99 - i * 0.1)), ...calls('small', [60, 61, 62])],
    )
    expect(r.included.map((o) => o.calls.length)).toEqual([3, 3])
  })

  it('empate de score: mais recente primeiro, depois id (determinístico)', () => {
    const r = selectWeeklyCalls([org('a', 'A')], calls('a', [80, 80, 80, 80]))
    expect(r.included[0].calls.map((c) => c.id)).toEqual(['a-c3', 'a-c2', 'a-c1'])
  })

  it('transcrição curta (≤ 100) ou nula não conta', () => {
    const cs = calls('a', [90, 85, 80])
    cs[0] = { ...cs[0], transcript: 'curta' }
    const r = selectWeeklyCalls([org('a', 'A')], cs)
    expect(r.included).toHaveLength(0)
    expect(r.skipped[0].eligibleCalls).toBe(2)
  })

  it('call sem org é ignorada', () => {
    const r = selectWeeklyCalls([org('a', 'A')], [...calls('a', [90, 80, 70]), { ...calls('x', [99])[0], org_id: null }])
    expect(r.included[0].calls.map((c) => c.overallScore)).toEqual([90, 80, 70])
  })
})

describe('selectWeeklyCalls — pulo sem abortar e exclusão de demo', () => {
  it('org com menos de 3 é pulada com motivo, as outras seguem', () => {
    const r = selectWeeklyCalls(
      [org('a', 'Alpha'), org('b', 'Beta'), org('c', 'Gamma')],
      [...calls('a', [90, 80, 70]), ...calls('b', [95, 85]), ...calls('c', [60, 61, 62, 63])],
    )
    expect(r.included.map((o) => o.orgName)).toEqual(['Alpha', 'Gamma'])
    expect(r.skipped).toEqual([
      { orgId: 'b', orgName: 'Beta', eligibleCalls: 2, reason: '2 call(s) elegível(is) nos últimos 90 dias (mínimo 3)' },
    ])
  })

  it('org sem nenhuma call também aparece como pulada (0)', () => {
    const r = selectWeeklyCalls([org('z', 'Zero')], [])
    expect(r.skipped[0]).toMatchObject({ orgName: 'Zero', eligibleCalls: 0 })
  })

  it('org is_demo nunca entra, mesmo com as melhores calls', () => {
    const r = selectWeeklyCalls(
      [org('demo', 'AskMoses Demo Org', true), org('a', 'A')],
      [...calls('demo', [99, 99, 98, 98, 98]), ...calls('a', [70, 71, 72])],
    )
    expect(r.included.map((o) => o.orgId)).toEqual(['a'])
    expect(r.skipped).toContainEqual(
      expect.objectContaining({ orgId: 'demo', reason: 'Org de demonstração/teste (is_demo)' }),
    )
  })

  it('cenário de prod em 30/09/2026: entram exatamente as 5 orgs esperadas', () => {
    const orgs = [
      org('cen', 'Centurion K9'),
      org('sms', 'Sit Means Sit San Antonio & Austin'),
      org('stf', 'Stay Focused Dog Training LLC'),
      org('ccw', 'Confident Canines Academy'),
      org('xen', "Xena's Pack"),
      org('wod', 'World Of Dog Training'),
      org('pro', 'Progressive Dog Training'),
      org('k9a', 'K9 Activity Club'),
      org('demo', 'AskMoses Demo Org', true),
      org('vs', 'VS Solutions', true),
    ]
    const n = (id: string, k: number) => calls(id, Array.from({ length: k }, (_, i) => 90 - i))
    const r = selectWeeklyCalls(orgs, [
      ...n('cen', 50), ...n('sms', 48), ...n('stf', 6), ...n('ccw', 4), ...n('xen', 4),
      ...n('wod', 2), ...n('pro', 1), ...n('demo', 22), ...n('vs', 1),
    ])
    expect(r.included.map((o) => o.orgName).sort()).toEqual([
      'Centurion K9',
      'Confident Canines Academy',
      'Sit Means Sit San Antonio & Austin',
      'Stay Focused Dog Training LLC',
      "Xena's Pack",
    ])
    expect(r.included.flatMap((o) => o.calls)).toHaveLength(15)
    expect(r.skipped.map((o) => o.orgName).sort()).toEqual([
      'AskMoses Demo Org', 'K9 Activity Club', 'Progressive Dog Training', 'VS Solutions', 'World Of Dog Training',
    ])
  })
})

// ─── Query de candidatas ─────────────────────────────────────────────────────

describe('fetchWeeklyCandidateCalls — filtros da query', () => {
  it('fechada + ganha no GHL + venda + score válido + transcrição + 90 dias; sem Stage 2', async () => {
    db.results.calls = { data: calls('a', [90]), error: null }
    await fetchWeeklyCandidateCalls(
      { from: (t: string) => builder(t) } as never,
      new Date('2026-09-30T12:00:00Z'),
    )
    const ops = db.recorded.find((r) => r.table === 'calls')!.ops
    const has = (name: string, ...args: unknown[]) =>
      ops.some(([n, a]) => n === name && JSON.stringify(a.slice(0, args.length)) === JSON.stringify(args))

    expect(has('eq', 'call_outcome', 'closed')).toBe(true)
    expect(has('eq', 'ghl_won_status', 'won')).toBe(true)
    expect(has('not', 'is_sales_call', 'is', false)).toBe(true)
    expect(has('not', 'scoring_status', 'in', '(scoring_failed,transcript_leaked)')).toBe(true)
    expect(has('not', 'overall_score', 'is', null)).toBe(true)
    expect(has('not', 'transcript', 'is', null)).toBe(true)
    expect(has('gte', 'created_at', '2026-07-02T12:00:00.000Z')).toBe(true)
    expect(JSON.stringify(ops)).not.toMatch(/stage2/)
  })
})

// ─── Prompt ──────────────────────────────────────────────────────────────────

describe('prompt semanal', () => {
  it('o SYSTEM_PROMPT do Script Builder continua byte a byte igual', () => {
    expect(createHash('sha256').update(SYSTEM_PROMPT).digest('hex')).toBe(
      'a4c1acc070707c2d22cec2d9f133a00bda876fdb60e9452d497fc1e269918d87',
    )
  })

  it('reaproveita formato JSON e definição das seções, e pede padrões vencedores anonimizados', () => {
    expect(WEEKLY_SYSTEM_PROMPT).toContain('Respond ONLY with a valid JSON object')
    expect(WEEKLY_SYSTEM_PROMPT).toContain('## What belongs in each section')
    expect(WEEKLY_SYSTEM_PROMPT).toMatch(/WINNING sales calls/)
    expect(WEEKLY_SYSTEM_PROMPT).toMatch(/ANONYMIZE/)
    expect(WEEKLY_SYSTEM_PROMPT).toMatch(/Never include prices/)
    expect(WEEKLY_SYSTEM_PROMPT).toContain('Discovery, Problem Agitation, Offer Presentation, Objection Handling, Close & Next Steps')
    // A regra do Builder que manda CITAR nomes/preços não pode vir junto.
    expect(WEEKLY_SYSTEM_PROMPT).not.toMatch(/referencing details actually present in the source/)
  })

  it('user prompt: rótulos anônimos por org e transcrição cortada', () => {
    const p = buildWeeklyUserPrompt([
      { calls: [{ transcript: 'y'.repeat(WEEKLY_MAX_TRANSCRIPT_CHARS + 500) }] },
      { calls: [{ transcript: 'z'.repeat(150) }] },
    ])
    expect(p).toContain('2 calls from 2 different businesses')
    expect(p).toContain('### Business A — call 1')
    expect(p).toContain('### Business B — call 1')
    expect(p).toContain('[transcript truncated]')
    expect(p).not.toContain('y'.repeat(WEEKLY_MAX_TRANSCRIPT_CHARS + 1))
  })
})

// ─── Validação das 5 seções ──────────────────────────────────────────────────

describe('validateWeeklyScript', () => {
  it('script com as 5 seções na ordem → válido', () => {
    expect(validateWeeklyScript(validScript())).toBeNull()
  })

  it('4 seções → erro', () => {
    const s = validScript()
    s.sections.pop()
    expect(validateWeeklyScript(s)).toMatch(/Esperadas 5 seções, vieram 4/)
  })

  it('ordem trocada → erro', () => {
    const s = validScript()
    ;[s.sections[0], s.sections[1]] = [s.sections[1], s.sections[0]]
    expect(validateWeeklyScript(s)).toMatch(/Seção 1 deveria ser "Discovery"/)
  })

  it('seção renomeada → erro', () => {
    const s = validScript()
    s.sections[4].name = 'Closing'
    expect(validateWeeklyScript(s)).toMatch(/Close & Next Steps/)
  })

  it('seção sem instructions → erro', () => {
    const s = validScript()
    s.sections[2].instructions = '  '
    expect(validateWeeklyScript(s)).toMatch(/Offer Presentation" sem instructions/)
  })

  it('pesos não são validados (seguem como hoje: o que a IA devolver)', () => {
    const s = validScript()
    s.sections[0].weight = 90
    expect(validateWeeklyScript(s)).toBeNull()
  })
})

// ─── Geração ponta a ponta (banco e IA simulados) ────────────────────────────

function seedDb(orgs: WeeklyOrg[], candidates: WeeklyCandidateCall[]) {
  db.results.organizations = { data: orgs, error: null }
  db.results.calls = { data: candidates, error: null }
  db.results.org_scripts = { data: null, error: null }
  db.results.scripts = [
    { data: { rubric_version_snapshot: 1, minor_version: 13 }, error: null },
    { data: null, error: null },
  ]
}

describe('generateWeeklySuggestedScript', () => {
  it('nenhuma org elegível → skipped, sem IA e sem gravar script', async () => {
    seedDb([org('a', 'A')], calls('a', [90, 80]))
    const r = await generateWeeklySuggestedScript()
    expect(r).toMatchObject({ ok: false, kind: 'skipped' })
    expect(ai.calls).toBe(0)
    expect(dbCreateScript).not.toHaveBeenCalled()
  })

  it('IA devolve seções fora do padrão → erro, script NÃO é gravado', async () => {
    seedDb([org('a', 'A')], calls('a', [90, 80, 70]))
    const bad = validScript()
    bad.sections = bad.sections.slice(0, 3)
    ai.text = JSON.stringify(bad)
    const r = await generateWeeklySuggestedScript()
    expect(r).toMatchObject({ ok: false, kind: 'error' })
    expect((r as { error: string }).error).toMatch(/Script inválido/)
    expect(dbCreateScript).not.toHaveBeenCalled()
  })

  it('JSON inválido → erro, script NÃO é gravado', async () => {
    seedDb([org('a', 'A')], calls('a', [90, 80, 70]))
    ai.text = 'not json'
    const r = await generateWeeklySuggestedScript()
    expect(r).toMatchObject({ ok: false, kind: 'error', error: 'AI returned invalid JSON' })
    expect(dbCreateScript).not.toHaveBeenCalled()
  })

  it('caminho feliz → grava o script com os pesos da IA e devolve seleção e custo', async () => {
    seedDb([org('a', 'A'), org('d', 'Demo', true)], [...calls('a', [90, 80, 70]), ...calls('d', [99, 99, 99])])
    ai.text = JSON.stringify(validScript())
    const r = await generateWeeklySuggestedScript()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.selection.included.map((o) => o.orgId)).toEqual(['a'])
    expect(r.usage).toEqual({ model: 'gpt-4o-mini', inputTokens: 1000, outputTokens: 200, costUsd: 0.0012 })
    const arg = (dbCreateScript.mock.calls[0] as unknown as [{ sections: { weight: number }[] }])[0]
    expect(arg.sections.map((s) => s.weight)).toEqual([20, 20, 20, 20, 20])
  })
})

// ─── Cron: envio e registro ──────────────────────────────────────────────────

const cronRequest = () => {
  process.env.CRON_SECRET = 'secret'
  return new Request('https://app/api/cron/weekly-script-suggestion', {
    headers: { authorization: 'Bearer secret' },
  }) as never
}

describe('cron weekly-script-suggestion', () => {
  it('rodada pulada → registra "skipped", não envia, responde 200', async () => {
    seedDb([org('a', 'A')], calls('a', [90]))
    db.results.script_suggestion_runs = { data: { id: 'run-1' }, error: null }
    const res = await GET(cronRequest())
    expect(res.status).toBe(200)
    expect(sendScriptToOrgs).not.toHaveBeenCalled()
    const run = db.inserts.find((i) => i.table === 'script_suggestion_runs')!.row as Record<string, unknown>
    expect(run.status).toBe('skipped')
    expect(run.skipped_orgs).toEqual([
      expect.objectContaining({ org_name: 'A', eligible_calls: 1 }),
    ])
  })

  it('script inválido → registra "error" com o motivo, não envia, responde 500', async () => {
    seedDb([org('a', 'A')], calls('a', [90, 80, 70]))
    ai.text = JSON.stringify({ ...validScript(), sections: [] })
    db.results.script_suggestion_runs = { data: { id: 'run-2' }, error: null }
    const res = await GET(cronRequest())
    expect(res.status).toBe(500)
    expect(sendScriptToOrgs).not.toHaveBeenCalled()
    const run = db.inserts.find((i) => i.table === 'script_suggestion_runs')!.row as Record<string, unknown>
    expect(run.status).toBe('error')
    expect(String(run.error)).toMatch(/Script inválido/)
  })

  it('sucesso → envia só para orgs não-demo e registra orgs, calls, script e custo', async () => {
    seedDb([org('a', 'A'), org('b', 'B')], [...calls('a', [90, 80, 70]), ...calls('b', [60])])
    ai.text = JSON.stringify(validScript())
    // 2ª consulta a organizations = destinatárias (is_demo = false).
    db.results.organizations = [
      { data: [org('a', 'A'), org('b', 'B')], error: null },
      { data: [{ id: 'a' }, { id: 'b' }], error: null },
    ]
    db.results.script_suggestion_runs = { data: { id: 'run-3' }, error: null }

    const res = await GET(cronRequest())
    expect(res.status).toBe(200)

    const recipientsQuery = db.recorded.filter((r) => r.table === 'organizations')[1]
    expect(recipientsQuery.ops).toContainEqual(['eq', ['is_demo', false]])
    expect(sendScriptToOrgs).toHaveBeenCalledWith({ scriptId: 'script-new', orgIds: ['a', 'b'], sentBy: null })

    const run = db.inserts.find((i) => i.table === 'script_suggestion_runs')!.row as Record<string, unknown>
    expect(run).toMatchObject({
      status: 'sent',
      script_id: 'script-new',
      sent_to_count: 2,
      call_ids: ['a-c0', 'a-c1', 'a-c2'],
      cost_usd: 0.0012,
      input_tokens: 1000,
      output_tokens: 200,
    })
    expect(run.included_orgs).toEqual([{ org_id: 'a', org_name: 'A', call_ids: ['a-c0', 'a-c1', 'a-c2'] }])
    expect(run.skipped_orgs).toEqual([expect.objectContaining({ org_name: 'B', eligible_calls: 1 })])
  })

  it('sem CRON_SECRET correto → 401 e nada roda', async () => {
    process.env.CRON_SECRET = 'secret'
    const res = await GET(new Request('https://app/x', { headers: { authorization: 'Bearer nope' } }) as never)
    expect(res.status).toBe(401)
    expect(ai.calls).toBe(0)
  })
})

// ─── error_reason em script_intelligence_cache (migration 121) ───────────────

describe('error_reason — o motivo do erro vai para o banco', () => {
  const read = (p: string) => require('node:fs').readFileSync(require('node:path').join(process.cwd(), p), 'utf8') as string

  it('process: grava analysis.error quando falha e limpa quando fica ready', () => {
    const s = read('app/api/script-intelligence/process/route.ts')
    expect(s).toMatch(/error_reason: analysis\.ok \? null : analysis\.error/)
    expect(s).toMatch(/error_reason: 'Org sem script ativo \(previous_script_id\) para comparar'/)
  })

  it('recover-stale-analyses: os dois caminhos de erro registram motivo', () => {
    const s = read('app/api/cron/recover-stale-analyses/route.ts')
    expect(s).toMatch(/error_reason: 'Pendente órfã/)
    expect(s).toMatch(/error_reason: 'Org sem script ativo/)
    expect((s.match(/analysis_status: 'error'/g) ?? []).length).toBe((s.match(/error_reason:/g) ?? []).length)
  })

  it('send-script: reenvio limpa o motivo anterior', () => {
    expect(read('lib/services/send-script.ts')).toMatch(/error_reason: null/)
  })
})
