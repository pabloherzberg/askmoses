/**
 * TC — migrations 117 (mark_stage2_paying_from_won) e 118 (backfill) num
 * Postgres de verdade (PGlite), no mesmo molde do tc-won-rate-sql.
 *
 * Cobre:
 *  1. A 117 aplica sem erro
 *  2. Alvo: call de venda mais recente; sem venda, a mais recente de todas
 *  3. became_paying_at = ghl_won_at, e só na primeira marcação
 *  4. Idempotência: segunda chamada não marca nem loga nada
 *  5. Stage 2 manual (pending) é soberano — pula
 *  6. Contato que já tem 'paying' em outra call não ganha uma segunda
 *  7. Trilha em calls_data_corrections (applied_by = ghl_won_sync)
 *  8. Só service_role executa a função
 *  9. Backfill 118: mesma regra, became_paying_at NULL; aborta sem efeito
 *     quando o número de marcadas diverge do esperado (inclusive ao rodar 2x)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FN_SQL = readFileSync(resolve(process.cwd(), 'scripts/117_stage2_from_ghl_won.sql'), 'utf8')
const BACKFILL_SQL = readFileSync(resolve(process.cwd(), 'scripts/118_stage2_won_backfill.sql'), 'utf8')

const ORG = '11111111-1111-1111-1111-111111111111'

// Só as colunas que 117/118 tocam. Tipos e CHECK iguais ao banco real
// (call_date é DATE; stage2_outcome tem o domínio da 092).
const SCHEMA = `
  create role anon;
  create role authenticated;
  create role service_role;

  create table public.calls (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null,
    contact_id text,
    is_sales_call boolean,
    call_date date,
    created_at timestamptz not null default now(),
    ghl_won_status text,
    ghl_won_at timestamptz,
    stage2_outcome text check (stage2_outcome is null or stage2_outcome in ('paying','not_paying','pending')),
    became_paying_at timestamptz);

  create table public.calls_data_corrections (
    id uuid primary key default gen_random_uuid(),
    call_id uuid not null references public.calls(id),
    column_name text not null,
    old_value jsonb,
    new_value jsonb,
    applied_by text not null,
    reason text,
    created_at timestamptz default now());
`

let db: PGlite

async function insertCall(c: {
  id: string
  contact: string
  sales: boolean | null
  date: string
  wonAt?: string | null
  stage2?: string | null
}) {
  await db.query(
    `insert into public.calls (id, org_id, contact_id, is_sales_call, call_date,
                               ghl_won_status, ghl_won_at, stage2_outcome)
     values ($1, $2, $3, $4, $5, 'won', $6, $7)`,
    [c.id, ORG, c.contact, c.sales, c.date, c.wonAt ?? null, c.stage2 ?? null],
  )
}

async function mark(contact: string): Promise<string | null> {
  const r = await db.query<{ id: string | null }>(
    `select public.mark_stage2_paying_from_won($1, $2) as id`,
    [ORG, contact],
  )
  return r.rows[0].id
}

async function stage2(id: string) {
  const r = await db.query<{ stage2_outcome: string | null; became_paying_at: Date | null }>(
    `select stage2_outcome, became_paying_at from public.calls where id = $1`,
    [id],
  )
  return r.rows[0]
}

async function corrections(appliedBy: string, callId?: string) {
  const r = await db.query<{ call_id: string; column_name: string }>(
    `select call_id, column_name from public.calls_data_corrections
     where applied_by = $1 ${callId ? 'and call_id = $2' : ''}
     order by column_name`,
    callId ? [appliedBy, callId] : [appliedBy],
  )
  return r.rows
}

// A 118 traz o esperado de prod fixo no topo do DO block; o teste troca pelo
// do fixture. Se o formato da linha mudar, o replace não casa e o teste falha.
function backfillExpecting(n: number): string {
  const pattern = /v_esperado CONSTANT int := \d+;/
  expect(BACKFILL_SQL).toMatch(pattern)
  return BACKFILL_SQL.replace(pattern, `v_esperado CONSTANT int := ${n};`)
}

const id = (n: number) => `aaaaaaaa-0000-0000-0000-${String(n).padStart(12, '0')}`

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SCHEMA)
})

afterAll(async () => {
  await db.close()
})

describe('117 — mark_stage2_paying_from_won', () => {
  it('aplica sem erro', async () => {
    await expect(db.exec(FN_SQL)).resolves.toBeDefined()
  })

  it('escolhe a call de venda mais recente, mesmo com não-venda mais nova', async () => {
    await insertCall({ id: id(1), contact: 'A', sales: true, date: '2026-03-01', wonAt: '2026-03-10T12:00:00Z' })
    await insertCall({ id: id(2), contact: 'A', sales: true, date: '2026-03-05', wonAt: '2026-03-10T12:00:00Z' })
    await insertCall({ id: id(3), contact: 'A', sales: false, date: '2026-03-08', wonAt: '2026-03-10T12:00:00Z' })

    expect(await mark('A')).toBe(id(2))
    expect((await stage2(id(2))).stage2_outcome).toBe('paying')
    expect((await stage2(id(1))).stage2_outcome).toBeNull()
    expect((await stage2(id(3))).stage2_outcome).toBeNull()
  })

  it('became_paying_at = ghl_won_at do alvo', async () => {
    expect((await stage2(id(2))).became_paying_at?.toISOString()).toBe('2026-03-10T12:00:00.000Z')
  })

  it('grava trilha das duas colunas com applied_by ghl_won_sync', async () => {
    expect(await corrections('ghl_won_sync', id(2))).toEqual([
      { call_id: id(2), column_name: 'became_paying_at' },
      { call_id: id(2), column_name: 'stage2_outcome' },
    ])
  })

  it('é idempotente e não regrava became_paying_at quando ghl_won_at muda', async () => {
    await db.query(`update public.calls set ghl_won_at = '2026-09-25T00:00:00Z' where contact_id = 'A'`)
    expect(await mark('A')).toBeNull()
    expect((await stage2(id(2))).became_paying_at?.toISOString()).toBe('2026-03-10T12:00:00.000Z')
    expect(await corrections('ghl_won_sync', id(2))).toHaveLength(2)
  })

  it('sem call de venda, escolhe a mais recente de todas', async () => {
    await insertCall({ id: id(10), contact: 'B', sales: null, date: '2026-04-01' })
    await insertCall({ id: id(11), contact: 'B', sales: false, date: '2026-04-03' })
    expect(await mark('B')).toBe(id(11))
  })

  it('sem ghl_won_at, usa now()', async () => {
    expect((await stage2(id(11))).became_paying_at).not.toBeNull()
  })

  it('call escolhida com Stage 2 manual (pending) é pulada', async () => {
    await insertCall({ id: id(20), contact: 'C', sales: true, date: '2026-05-01' })
    await insertCall({ id: id(21), contact: 'C', sales: true, date: '2026-05-02', stage2: 'pending' })
    expect(await mark('C')).toBeNull()
    expect((await stage2(id(21))).stage2_outcome).toBe('pending')
    expect((await stage2(id(20))).stage2_outcome).toBeNull()
  })

  it('contato que já tem paying em outra call não ganha uma segunda', async () => {
    await insertCall({ id: id(30), contact: 'D', sales: true, date: '2026-06-01', stage2: 'paying' })
    await insertCall({ id: id(31), contact: 'D', sales: true, date: '2026-06-02' })
    expect(await mark('D')).toBeNull()
    expect((await stage2(id(31))).stage2_outcome).toBeNull()
  })

  it('contato sem call não faz nada', async () => {
    expect(await mark('inexistente')).toBeNull()
  })

  it('anon e authenticated não executam a função; service_role executa', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await expect(mark('A')).rejects.toThrow(/permission denied/)
      await db.exec('reset role')
    }
    await db.exec(`grant select, update on public.calls to service_role;
                   grant insert on public.calls_data_corrections to service_role;`)
    await db.exec('set role service_role')
    await expect(mark('A')).resolves.toBeNull()
    await db.exec('reset role')
  })
})

describe('118 — backfill', () => {
  beforeAll(async () => {
    // E: dois calls won sem Stage 2 — deve marcar a de venda, com data NULL.
    await insertCall({ id: id(40), contact: 'E', sales: true, date: '2026-07-01', wonAt: '2026-09-25T00:00:00Z' })
    await insertCall({ id: id(41), contact: 'E', sales: false, date: '2026-07-05', wonAt: '2026-09-25T00:00:00Z' })
    // F: contato não-won — não pode ser tocado.
    await db.query(
      `insert into public.calls (id, org_id, contact_id, is_sales_call, call_date, ghl_won_status)
       values ($1, $2, 'F', true, '2026-07-01', 'lost')`,
      [id(50), ORG],
    )
  })

  it('esperado divergente aborta sem gravar nada', async () => {
    // O arquivo real espera 198 (prod); aqui só 1 call é elegível.
    await expect(db.exec(BACKFILL_SQL)).rejects.toThrow(/marcaria 1 calls, esperado 198/)
    expect((await stage2(id(40))).stage2_outcome).toBeNull()
    expect(await corrections('118_stage2_won_backfill')).toHaveLength(0)
  })

  it('aplica e marca só os contatos won elegíveis, com became_paying_at NULL', async () => {
    await db.exec(backfillExpecting(1))

    const e = await stage2(id(40))
    expect(e.stage2_outcome).toBe('paying')
    expect(e.became_paying_at).toBeNull()
    expect((await stage2(id(41))).stage2_outcome).toBeNull()
    expect((await stage2(id(50))).stage2_outcome).toBeNull()
    // C (pending) e D (já paying) continuam como estavam
    expect((await stage2(id(20))).stage2_outcome).toBeNull()
    expect((await stage2(id(31))).stage2_outcome).toBeNull()

    // A e B já estavam marcados pela função; só E entra no backfill.
    expect(await corrections('118_stage2_won_backfill')).toEqual([
      { call_id: id(40), column_name: 'stage2_outcome' },
    ])
  })

  it('rodar de novo marca 0, aborta e não duplica nada', async () => {
    await expect(db.exec(backfillExpecting(1))).rejects.toThrow(/marcaria 0 calls, esperado 1/)
    expect(await corrections('118_stage2_won_backfill')).toHaveLength(1)
  })
})
