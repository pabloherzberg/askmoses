/**
 * TC — Filtro "só calls de venda" nas análises
 *
 * Complementa tc-sales-call-gate.test.ts: aquele cobre a ESCRITA (a IA
 * classifica e o pipeline persiste is_sales_call). Este cobre a LEITURA —
 * garantir que nenhuma agregação de métrica misture call não-venda, e que
 * billing continue somando 100% do custo.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isCountableSalesCall, isCountableSalesCallRow, applySalesCallOnly } from '@/lib/sales-calls'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

// ─── Semântica do predicado ──────────────────────────────────────────────────

describe('isCountableSalesCall — semântica de NULL', () => {
  it('true → conta (é call de venda)', () => {
    expect(isCountableSalesCall({ isSalesCall: true })).toBe(true)
  })

  it('false → NÃO conta (IA classificou como não-venda)', () => {
    expect(isCountableSalesCall({ isSalesCall: false })).toBe(false)
  })

  it('null → conta (call legada, "não classificado" ≠ "não é venda")', () => {
    expect(isCountableSalesCall({ isSalesCall: null })).toBe(true)
  })

  it('undefined (coluna ausente no select) → conta', () => {
    expect(isCountableSalesCall({})).toBe(true)
  })

  it('versão snake_case espelha a camelCase', () => {
    expect(isCountableSalesCallRow({ is_sales_call: false })).toBe(false)
    expect(isCountableSalesCallRow({ is_sales_call: null })).toBe(true)
    expect(isCountableSalesCallRow({ is_sales_call: true })).toBe(true)
  })
})

// ─── Tradução para PostgREST ─────────────────────────────────────────────────

describe('applySalesCallOnly — filtro no query builder', () => {
  it('emite not(is_sales_call, is, false) — equivalente a IS DISTINCT FROM false', () => {
    const calls: unknown[][] = []
    const fake = {
      not(column: string, operator: string, value: unknown) {
        calls.push([column, operator, value])
        return this
      },
    }
    applySalesCallOnly(fake)
    expect(calls).toEqual([['is_sales_call', 'is', false]])
  })

  it('retorna o builder para permitir encadeamento (.order/.limit depois)', () => {
    const fake = { not() { return this } }
    expect(applySalesCallOnly(fake)).toBe(fake)
  })
})

// ─── Cobertura dos pontos de agregação ───────────────────────────────────────

describe('agregações de métrica filtram calls de venda', () => {
  it('syncTrainerStats filtra na ORIGEM do leaderboard', () => {
    const s = src('lib/db/trainers.ts')
    expect(s).toMatch(/applySalesCallOnly\(\s*supabase\s*\n?\s*\.from\('calls'\)/)
  })

  it('getTeamHealth filtra o status de atividade do time', () => {
    expect(src('lib/services/trainers.ts')).toMatch(/applySalesCallOnly\(/)
  })

  it('getPerformanceTrends filtra tanto a query própria quanto calls pré-carregadas', () => {
    const s = src('lib/services/trainers.ts')
    expect(s).toMatch(/getCalls\(\{[^}]*salesOnly:\s*true/s)
    expect(s).toMatch(/filter\(isCountableSalesCall\)/)
  })

  it('dbGetCalls expõe salesOnly e o aplica', () => {
    const s = src('lib/db/calls.ts')
    expect(s).toMatch(/salesOnly\?:\s*boolean/)
    expect(s).toMatch(/if \(filters\?\.salesOnly\) query = applySalesCallOnly\(query\)/)
  })

  it('getCalls repassa salesOnly para a camada db', () => {
    expect(src('lib/services/calls.ts')).toMatch(/salesOnly:\s*filters\?\.salesOnly/)
  })

  it('/me agrega só calls de venda (trainer e time)', () => {
    const s = src('app/[locale]/(trainer)/me/page.tsx')
    expect(s).toMatch(/getCalls\(\{ trainerId, salesOnly: true \}\)/)
    expect(s).toMatch(/getCalls\(\{ salesOnly: true \}\)/)
  })

  it('/api/coaching (Team Command Center) filtra', () => {
    expect(src('app/api/coaching/route.ts')).toMatch(/salesOnly:\s*true/)
  })

  it('/api/coaching/recommendations filtra', () => {
    expect(src('app/api/coaching/recommendations/route.ts')).toMatch(/salesOnly:\s*true/)
  })

  it('/dashboard/analytics pede salesOnly na agregação client-side', () => {
    expect(src('app/[locale]/dashboard/analytics/page.tsx')).toMatch(/api\/calls\?salesOnly=true/)
  })

  it('IntentDashboard não agrega calls não-venda', () => {
    expect(src('components/shared/IntentDashboard.tsx')).toMatch(/salesOnly=true/)
  })

  it('script-gap analisa só calls de venda', () => {
    expect(src('lib/script-gap/analyze.ts')).toMatch(/applySalesCallOnly\(/)
  })

  it('script-intelligence analisa só calls de venda', () => {
    expect(src('lib/script-intelligence/analyze.ts')).toMatch(/applySalesCallOnly\(/)
  })

  it('weekly-suggestion seleciona só calls de venda', () => {
    expect(src('lib/script-intelligence/weekly-suggestion.ts')).toMatch(/applySalesCallOnly\(/)
  })

  it('dbGetOrgCloseRate (card Avg Close Rate + insight ROI) filtra total e closed', () => {
    const s = src('lib/db/calls.ts')
    const fn = s.slice(s.indexOf('export async function dbGetOrgCloseRate'))
    // As duas contagens (total e closed) precisam do filtro — senão o
    // denominador infla e o close rate cai.
    expect((fn.match(/applySalesCallOnly\(/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('insights (getInsights + generateInsights) filtra', () => {
    const s = src('lib/services/insights.ts')
    expect((s.match(/salesOnly:\s*true/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('getRubric (trend semanal + section scores do dashboard) filtra', () => {
    expect(src('lib/services/rubric.ts')).toMatch(/getCalls\(\{[^}]*salesOnly:\s*true/s)
  })

  it('marketing-intelligence filtra as duas seleções de calls', () => {
    const s = src('lib/services/marketing-intelligence.ts')
    expect((s.match(/salesOnly:\s*true/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('appointments (intent por contato) filtra', () => {
    expect(src('lib/services/appointments.ts')).toMatch(/applySalesCallOnly\(/)
  })
})

// ─── Regressão: 0 calls de venda deve ZERAR o trainer, não manter o antigo ───

describe('trainer sem calls de venda é zerado (não persiste snapshot antigo)', () => {
  it('syncTrainerStats reseta o snapshot quando não há call de venda', () => {
    const s = src('lib/db/trainers.ts')
    // O early-return puro (`return` logo após o length===0) seria o bug.
    expect(s).not.toMatch(/length === 0\) return\n/)
    // Precisa zerar total_calls dentro do branch de 0 calls.
    const branch = s.slice(s.indexOf('calls.length === 0'))
    expect(branch).toMatch(/total_calls:\s*0/)
    expect(branch).toMatch(/close_rate:\s*0/)
  })

  it('withLiveTrainerStats (Team Command Center) zera em vez de ressuscitar o snapshot', () => {
    const s = src('lib/services/coaching.ts')
    const branch = s.slice(s.indexOf('calls.length === 0'))
    // Não pode ser `return trainer` cru — tem que zerar os stats.
    expect(branch).not.toMatch(/calls\.length === 0\) return trainer/)
    expect(branch).toMatch(/totalCalls:\s*0/)
    expect(branch).toMatch(/closeRate:\s*0/)
  })
})

// ─── Listagens NÃO filtram (precisam exibir o badge "não é venda") ───────────

describe('listagens continuam exibindo calls não-venda', () => {
  it('dbGetCalls não filtra por padrão — salesOnly é opt-in', () => {
    const s = src('lib/db/calls.ts')
    // O filtro só é aplicado dentro do if — nunca incondicionalmente.
    expect(s).not.toMatch(/^\s*query = applySalesCallOnly\(query\)$/m)
  })

  it('/api/calls só filtra quando o caller pede explicitamente', () => {
    expect(src('app/api/calls/route.ts')).toMatch(
      /searchParams\.get\('salesOnly'\) === 'true'/,
    )
  })

  it('CallsTable ainda renderiza o caso não-venda', () => {
    expect(src('app/[locale]/calls/CallsTable.tsx')).toMatch(/isSalesCall === false/)
  })
})

// ─── Billing NÃO pode filtrar ────────────────────────────────────────────────

describe('billing contabiliza 100% das calls, inclusive não-venda', () => {
  it('lib/db/billing.ts não aplica o filtro de venda', () => {
    const s = src('lib/db/billing.ts')
    expect(s).not.toMatch(/applySalesCallOnly/)
    expect(s).not.toMatch(/is_sales_call/)
  })

  it('dbGetOrgMonthSeconds (minutos faturáveis) não filtra', () => {
    const s = src('lib/db/clients.ts')
    expect(s).not.toMatch(/applySalesCallOnly/)
    expect(s).not.toMatch(/is_sales_call/)
  })

  it('o gate registra recordLlmUsage nos dois pipelines antes de sair', () => {
    // Custo da chamada de classificação é contabilizado mesmo quando a call
    // é descartada da análise — critério de aceite explícito.
    expect(src('app/api/analyze/route.ts')).toMatch(
      /if \(!parsed\.isSalesCall\)[\s\S]*?recordLlmUsage\(/,
    )
    expect(src('lib/services/ghl-call-scoring.ts')).toMatch(
      /if \(!result\.isSalesCall\)[\s\S]*?recordLlmUsage\(/,
    )
  })
})
