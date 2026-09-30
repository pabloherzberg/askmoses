/**
 * Preview manual da sugestão semanal (scripts/preview-weekly-suggestion.mts →
 * lib/script-intelligence/weekly-preview.ts).
 *
 *   - dry-run não grava nada (nenhum insert/update/upsert, nenhum script,
 *     nenhum envio, nenhum llm_usage);
 *   - --send-to recusa org que não é is_demo, antes de chamar a IA;
 *   - o script de teste é da org (org_id preenchido), nunca global;
 *   - o script de teste não mexe no minor_version que o cron usa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { WEEKLY_SECTION_NAMES } from '@/lib/script-intelligence/weekly-prompt'

type Result = { data: unknown; error: unknown }

const db = vi.hoisted(() => ({
  results: {} as Record<string, Result | Result[]>,
  writes: [] as Array<{ table: string; op: string; arg: unknown }>,
}))

function next(table: string): Result {
  const r = db.results[table]
  if (Array.isArray(r)) return r.shift() ?? { data: [], error: null }
  return r ?? { data: [], error: null }
}

function builder(table: string) {
  const b: Record<string, unknown> = {}
  const chain = (name: string) => (...args: unknown[]) => {
    if (['insert', 'update', 'upsert', 'delete'].includes(name)) db.writes.push({ table, op: name, arg: args[0] })
    return b
  }
  for (const m of ['select', 'eq', 'not', 'or', 'gte', 'is', 'in', 'order', 'range', 'limit', 'update', 'insert', 'upsert', 'delete']) {
    b[m] = chain(m)
  }
  b.maybeSingle = async () => next(table)
  b.single = async () => next(table)
  b.then = (resolve: (r: Result) => unknown) => Promise.resolve(next(table)).then(resolve)
  return b
}

const rpc = vi.hoisted(() => vi.fn(async () => ({ data: [], error: null })))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t), rpc }),
}))

const ai = vi.hoisted(() => ({ text: '', calls: 0 }))
vi.mock('ai', () => ({
  generateText: async () => {
    ai.calls += 1
    return { text: ai.text, usage: { inputTokens: 1000, outputTokens: 200 } }
  },
}))
vi.mock('@/lib/openai', () => ({ getOpenAIModel: () => ({}), resolveOpenAIModelId: (m: string) => m }))
const recordLlmUsage = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/lib/services/llm-usage', () => ({
  recordLlmUsage,
  computeCostForModel: async () => 0.0012,
}))
const dbCreateScript = vi.hoisted(() => vi.fn(async () => ({ id: 'script-test' })))
vi.mock('@/lib/db/scripts', () => ({ dbCreateScript }))
const sendScriptToOrgs = vi.hoisted(() => vi.fn(async (p: { orgIds: string[] }) => ({ sentTo: p.orgIds.length })))
vi.mock('@/lib/services/send-script', () => ({ sendScriptToOrgs }))

import {
  MANUAL_TEST_SOURCE,
  formatPreviewReport,
  parsePreviewArgs,
  runWeeklyPreview,
} from '@/lib/script-intelligence/weekly-preview'

const DEMO_ORG = '67a11f99-2732-4d58-b454-505e3decf933'
const REAL_ORG = '11111111-2222-3333-4444-555555555555'

beforeEach(() => {
  db.results = {}
  db.writes = []
  ai.text = ''
  ai.calls = 0
  rpc.mockClear()
  recordLlmUsage.mockClear()
  dbCreateScript.mockClear()
  sendScriptToOrgs.mockClear()
})

const LONG = 'x'.repeat(200)

function seedSelection() {
  // Org "a" (real, 3 calls vencedoras) entra; "b" tem só 1 e é pulada.
  const orgs = [
    { id: 'a', name: 'Alpha Dogs', is_demo: false },
    { id: 'b', name: 'Beta K9', is_demo: false },
  ]
  const calls = [
    ...[90, 80, 70].map((s, i) => ({
      id: `a-c${i}`, org_id: 'a', overall_score: s, transcript: LONG,
      created_at: `2026-09-1${i}T10:00:00Z`, trainer_name: 'Austin Ackerman', client_name: 'Jenna Maier',
    })),
    { id: 'b-c0', org_id: 'b', overall_score: 88, transcript: LONG, created_at: '2026-09-10T10:00:00Z', trainer_name: null, client_name: null },
  ]
  return { orgs, calls }
}

const validScript = () => ({
  name: 'Winning Patterns Script',
  description: 'What works at Alpha Dogs',
  sections: WEEKLY_SECTION_NAMES.map((name, i) => ({
    name: name as string,
    instructions: i === 2 ? 'Present the program for $1,200.' : `do ${i}`,
    tips: `tip ${i}`,
    weight: 20,
    critical: false,
  })),
  full_script: 'Hi, this is Austin.',
  explanation: 'e',
})

describe('parsePreviewArgs', () => {
  it('sem argumento ou com --dry-run → dry-run', () => {
    expect(parsePreviewArgs([])).toEqual({ mode: 'dry-run' })
    expect(parsePreviewArgs(['--dry-run'])).toEqual({ mode: 'dry-run' })
  })
  it('--send-to <uuid> → send', () => {
    expect(parsePreviewArgs(['--send-to', DEMO_ORG])).toEqual({ mode: 'send', orgId: DEMO_ORG })
  })
  it('--model <id do catálogo> em qualquer modo', () => {
    expect(parsePreviewArgs(['--model', 'gpt-6.1-sol'])).toEqual({ mode: 'dry-run', model: 'gpt-6.1-sol' })
    expect(parsePreviewArgs(['--dry-run', '--model', 'gpt-6-astra'])).toEqual({ mode: 'dry-run', model: 'gpt-6-astra' })
    expect(parsePreviewArgs(['--send-to', DEMO_ORG, '--model', 'gpt-6-astra'])).toEqual({
      mode: 'send', orgId: DEMO_ORG, model: 'gpt-6-astra',
    })
  })
  it('--model fora do catálogo ou sem valor → erro (nada de cair em outro modelo)', () => {
    expect(parsePreviewArgs(['--model', 'gpt-6-sol-typo'])).toHaveProperty('error')
    expect(parsePreviewArgs(['--model'])).toHaveProperty('error')
    expect(parsePreviewArgs(['--model', '--dry-run'])).toHaveProperty('error')
  })
  it('--send-to sem uuid, os dois modos juntos, ou argumento solto → erro', () => {
    expect(parsePreviewArgs(['--send-to'])).toHaveProperty('error')
    expect(parsePreviewArgs(['--send-to', 'demo'])).toHaveProperty('error')
    expect(parsePreviewArgs(['--dry-run', '--send-to', DEMO_ORG])).toHaveProperty('error')
    expect(parsePreviewArgs(['--apply'])).toHaveProperty('error')
  })
})

describe('dry-run', () => {
  it('não grava nada: nem scripts, nem org_scripts, nem script_suggestion_runs, nem llm_usage', async () => {
    const { orgs, calls } = seedSelection()
    db.results.organizations = { data: orgs, error: null }
    db.results.calls = { data: calls, error: null }
    ai.text = JSON.stringify(validScript())

    const r = await runWeeklyPreview({ mode: 'dry-run' })

    expect(r.status).toBe('dry-run')
    expect(ai.calls).toBe(1)
    expect(db.writes).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
    expect(dbCreateScript).not.toHaveBeenCalled()
    expect(sendScriptToOrgs).not.toHaveBeenCalled()
    expect(recordLlmUsage).not.toHaveBeenCalled()
  })

  it('imprime orgs incluídas e puladas, call_ids, as 5 seções e as substituições', async () => {
    const { orgs, calls } = seedSelection()
    db.results.organizations = { data: orgs, error: null }
    db.results.calls = { data: calls, error: null }
    ai.text = JSON.stringify(validScript())

    const r = await runWeeklyPreview({ mode: 'dry-run' })
    if (r.status !== 'dry-run') throw new Error(r.status)
    const report = formatPreviewReport(r.draft)

    expect(report).toContain('Alpha Dogs (a)')
    expect(report).toMatch(/Beta K9 \(b\): .+\[1 elegíveis\]/)
    expect(report).toContain('call_ids: a-c0, a-c1, a-c2')
    for (const name of WEEKLY_SECTION_NAMES) expect(report).toContain(`## ${name}`)
    // O script já sai anonimizado, como no cron.
    expect(report).toContain('Present the program for [price].')
    expect(report).not.toContain('$1,200')
    expect(report).toMatch(/money\s+sections\[Offer Presentation\]\.instructions\s+×1/)
    expect(report).toMatch(/org\s+description\s+×1/)
  })
})

describe('--send-to', () => {
  it('recusa org que não é is_demo — sem IA e sem gravar nada', async () => {
    db.results.organizations = { data: { id: REAL_ORG, name: 'Cliente Real', is_demo: false }, error: null }

    const r = await runWeeklyPreview({ mode: 'send', orgId: REAL_ORG })

    expect(r).toMatchObject({ status: 'refused' })
    expect((r as { reason: string }).reason).toMatch(/is_demo/)
    expect(ai.calls).toBe(0)
    expect(db.writes).toEqual([])
    expect(dbCreateScript).not.toHaveBeenCalled()
    expect(sendScriptToOrgs).not.toHaveBeenCalled()
  })

  it('recusa org inexistente', async () => {
    db.results.organizations = { data: null, error: null }
    const r = await runWeeklyPreview({ mode: 'send', orgId: REAL_ORG })
    expect(r).toMatchObject({ status: 'refused' })
    expect(ai.calls).toBe(0)
  })

  it('recusa se a migration 123 (coluna source) não estiver aplicada', async () => {
    db.results.organizations = { data: { id: DEMO_ORG, name: 'AskMoses Demo Org', is_demo: true }, error: null }
    db.results.script_suggestion_runs = { data: null, error: { message: 'column script_suggestion_runs.source does not exist' } }
    const r = await runWeeklyPreview({ mode: 'send', orgId: DEMO_ORG })
    expect(r).toMatchObject({ status: 'refused' })
    expect((r as { reason: string }).reason).toMatch(/migration 123/)
    expect(ai.calls).toBe(0)
  })

  it('org demo: script da org (não global), pending só para ela, rodada marcada como teste manual', async () => {
    const { orgs, calls } = seedSelection()
    db.results.organizations = [
      { data: { id: DEMO_ORG, name: 'AskMoses Demo Org', is_demo: true }, error: null }, // checagem
      { data: orgs, error: null }, // seleção
    ]
    db.results.calls = { data: calls, error: null }
    db.results.org_scripts = { data: null, error: null }
    db.results.script_suggestion_runs = [
      { data: [], error: null }, // preflight da coluna source
      { data: { id: 'run-1' }, error: null }, // insert
    ]
    ai.text = JSON.stringify(validScript())

    const r = await runWeeklyPreview({ mode: 'send', orgId: DEMO_ORG })

    expect(r).toMatchObject({ status: 'sent', scriptId: 'script-test', runId: 'run-1' })

    // Não é global: org_id = a org de teste.
    const created = (dbCreateScript.mock.calls[0] as unknown as [{ orgId?: string; isActive?: boolean }])[0]
    expect(created.orgId).toBe(DEMO_ORG)
    expect(created.isActive).toBe(false)

    // Pending só para ela.
    expect(sendScriptToOrgs).toHaveBeenCalledTimes(1)
    expect(sendScriptToOrgs).toHaveBeenCalledWith({ scriptId: 'script-test', orgIds: [DEMO_ORG], sentBy: null })

    // Rodada registrada como teste manual.
    const runs = db.writes.filter((w) => w.table === 'script_suggestion_runs')
    expect(runs).toHaveLength(1)
    expect(runs[0].arg).toMatchObject({
      source: MANUAL_TEST_SOURCE,
      status: 'sent',
      script_id: 'script-test',
      sent_to_count: 1,
      call_ids: ['a-c0', 'a-c1', 'a-c2'],
    })

    // minor_version do cron intocado: nenhum UPDATE em scripts (o teste
    // fica com os defaults 1/0 do banco).
    expect(db.writes.filter((w) => w.table === 'scripts')).toEqual([])

    // Custo registrado na org de teste, com ref própria.
    expect(recordLlmUsage).toHaveBeenCalledWith(expect.objectContaining({ orgId: DEMO_ORG, ref: 'weekly-script-preview' }))
  })
})

describe('cron de segunda intocado', () => {
  const cron = readFileSync('app/api/cron/weekly-script-suggestion/route.ts', 'utf8')
  // Só código: comentários explicam o assunto e citariam os nomes.
  const preview = readFileSync('lib/script-intelligence/weekly-preview.ts', 'utf8').replace(/\/\/.*$/gm, '')

  it('o cron não grava source (fica o DEFAULT cron) e continua enviando só para is_demo = false', () => {
    expect(cron).not.toMatch(/source/)
    expect(cron).toContain(".eq('is_demo', false)")
  })

  it('o preview nunca grava minor_version nem rubric_version_snapshot', () => {
    expect(preview).not.toMatch(/minor_version\s*:/)
    expect(preview).not.toMatch(/rubric_version_snapshot\s*:/)
    expect(preview).not.toMatch(/orgId:\s*null/)
  })
})
