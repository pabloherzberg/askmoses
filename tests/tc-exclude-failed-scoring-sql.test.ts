/**
 * excludeFailedScoring contra Postgres REAL (PGlite) — scoring_status NULL
 * tem que passar.
 *
 * Incidente de 30/09/2026: o filtro era `.not('scoring_status','in',
 * '(scoring_failed,transcript_leaked)')`. O PostgREST traduz para
 * `NOT (scoring_status = ANY(...))`, que é NULL quando scoring_status é NULL,
 * e o Postgres descarta a linha. Em prod quase todas as calls têm
 * scoring_status NULL: 0 de 1216 passaram, e o sync-trainers zerou o cache
 * (total_calls, score, close_rate) de todos os trainers.
 *
 * Como o teste funciona: chama o excludeFailedScoring REAL num builder que
 * só registra a chamada, traduz o filtro registrado para SQL com a mesma
 * regra do PostgREST (docs: operadores `in` → `= ANY`, prefixo `not.` →
 * `NOT (...)`, `or=(a,b)` → `(a OR b)`, `is.null` → `IS NULL`) e executa no
 * Postgres. A semântica de NULL, que é o bug, vem do Postgres de verdade.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { excludeFailedScoring } from '@/lib/sales-calls'

// ─── Tradução PostgREST → SQL (só os operadores que os filtros usam) ─────────

function sqlLiteral(v: string): string {
  if (v === 'null') return 'NULL'
  if (v === 'true' || v === 'false') return v
  return `'${v.replace(/'/g, "''")}'`
}

function inList(raw: string): string {
  const inner = raw.replace(/^\(/, '').replace(/\)$/, '')
  const items = inner.split(',').map((s) => s.trim()).filter(Boolean)
  return `ARRAY[${items.map(sqlLiteral).join(', ')}]::text[]`
}

/** `col.op.value` ou `col.not.op.value` (formato de dentro do or=). */
function conditionToSql(expr: string): string {
  const m = /^([\w]+)\.(not\.)?(\w+)\.(.+)$/.exec(expr)
  if (!m) throw new Error(`condição PostgREST não suportada: ${expr}`)
  const [, col, neg, op, value] = m
  return opToSql(col, op, value, Boolean(neg))
}

function opToSql(col: string, op: string, value: string, negate: boolean): string {
  let base: string
  switch (op) {
    case 'in':
      base = `${col} = ANY(${inList(value)})`
      break
    case 'is':
      base = `${col} IS ${value === 'null' ? 'NULL' : value.toUpperCase()}`
      break
    case 'eq':
      base = `${col} = ${sqlLiteral(value)}`
      break
    default:
      throw new Error(`operador PostgREST não suportado: ${op}`)
  }
  return negate ? `NOT (${base})` : base
}

/** Divide por vírgula de topo (fora de parênteses). */
function splitTopLevel(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

/** Registra as chamadas de filtro e devolve o WHERE equivalente do PostgREST. */
function whereFrom(apply: (b: FilterRecorder) => unknown): string {
  const rec = new FilterRecorder()
  apply(rec)
  return rec.clauses.length > 0 ? rec.clauses.map((c) => `(${c})`).join(' AND ') : 'TRUE'
}

class FilterRecorder {
  clauses: string[] = []
  not(column: string, operator: string, value: unknown): this {
    this.clauses.push(opToSql(column, operator, value === null ? 'null' : String(value), true))
    return this
  }
  or(filters: string): this {
    this.clauses.push(splitTopLevel(filters).map(conditionToSql).join(' OR '))
    return this
  }
}

// ─── Banco ───────────────────────────────────────────────────────────────────

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE calls (id text PRIMARY KEY, scoring_status text);
    INSERT INTO calls VALUES
      ('null-1', NULL),
      ('null-2', NULL),
      ('ok', 'ok'),
      ('failed', 'scoring_failed'),
      ('leaked', 'transcript_leaked');
  `)
})

afterAll(async () => {
  await db.close()
})

async function idsPassing(where: string): Promise<string[]> {
  const r = await db.query<{ id: string }>(`SELECT id FROM calls WHERE ${where} ORDER BY id`)
  return r.rows.map((x) => x.id)
}

describe('excludeFailedScoring — semântica em Postgres real', () => {
  it('mantém scoring_status NULL e "ok"; tira scoring_failed e transcript_leaked', async () => {
    const where = whereFrom((b) => excludeFailedScoring(b))
    expect(await idsPassing(where)).toEqual(['null-1', 'null-2', 'ok'])
  })

  it('base de prod: 1216 calls com scoring_status NULL passam todas', async () => {
    await db.exec(`CREATE TEMP TABLE bulk AS SELECT g::text AS id, NULL::text AS scoring_status FROM generate_series(1, 1216) g`)
    const where = whereFrom((b) => excludeFailedScoring(b))
    const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM bulk WHERE ${where}`)
    expect(r.rows[0].n).toBe(1216)
  })

  it('o padrão antigo `.not(col, in, …)` descarta NULL — é o bug, não usar', async () => {
    const buggy = whereFrom((b) => b.not('scoring_status', 'in', '(scoring_failed,transcript_leaked)'))
    expect(buggy).toBe(`(NOT (scoring_status = ANY(ARRAY['scoring_failed', 'transcript_leaked']::text[])))`)
    expect(await idsPassing(buggy)).toEqual(['ok'])
  })

  it('equivale a IS DISTINCT FROM os dois valores', async () => {
    const reference = await idsPassing(
      `scoring_status IS DISTINCT FROM 'scoring_failed' AND scoring_status IS DISTINCT FROM 'transcript_leaked'`,
    )
    const where = whereFrom((b) => excludeFailedScoring(b))
    expect(await idsPassing(where)).toEqual(reference)
  })
})
