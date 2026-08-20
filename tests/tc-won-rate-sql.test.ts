/**
 * TC — migration 107 rodando num Postgres de verdade
 *
 * Os outros testes de SQL neste repo checam o texto do arquivo com regex, o
 * que prova que a linha existe e não que ela funciona. Aqui a migration é
 * APLICADA num Postgres real (PGlite, in-process, sem Docker nem serviço
 * externo) contra um schema mínimo que imita produção, e os números são
 * conferidos.
 *
 * Cobre:
 *  1. A migration aplica sem erro
 *  2. org_won_rate — os 7 cenários que separam certo de errado
 *  3. O backfill roda na subida e não se repete
 *  4. O carimbo semanal: contagem por semana, e a média que ignora call sem nota
 *  5. Só grava quando muda
 *  6. Venda que chega depois recalcula a semana ANTIGA do agendamento
 *  7. O trigger de updated_at
 *  8. Append-only: nem service_role faz UPDATE ou DELETE
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION = resolve(process.cwd(), 'scripts/107_won_rate_and_weekly_stats.sql')

const ORG = '11111111-1111-1111-1111-111111111111'
const T1 = '33333333-3333-3333-3333-333333333331'
const T2 = '33333333-3333-3333-3333-333333333332'

// Só o que a migration toca. Roles do Supabase precisam existir pros
// GRANT/REVOKE — e criá-las é o que permite testar o append-only de fato.
const SCHEMA = `
  create role anon;
  create role authenticated;
  create role service_role;

  create type call_outcome_enum as enum ('closed', 'not_closed');

  create table public.organizations (
    id uuid primary key default gen_random_uuid(), name text);

  create table public.users (id uuid primary key default gen_random_uuid());

  -- user_id NOT NULL + UNIQUE(user_id, org_id) espelham o banco real. A
  -- primeira versão deste schema deixava user_id nulável, o teste passava
  -- aqui e o mesmo fixture estourava no Supabase. Schema de teste permissivo
  -- demais não testa: mente.
  create table public.trainers (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id),
    org_id uuid references public.organizations(id),
    unique (user_id, org_id));

  create table public.rubrics (
    id uuid primary key default gen_random_uuid(), name text not null);

  create table public.calls (
    id uuid primary key default gen_random_uuid(),
    rubric_id uuid not null references public.rubrics(id),
    org_id uuid references public.organizations(id),
    trainer_id uuid references public.trainers(id),
    trainer_name text not null,
    trainer_email text not null,
    transcript text not null,
    overall_score numeric(4,1),
    summary text not null,
    strengths text[] not null,
    improvements text[] not null,
    call_outcome call_outcome_enum,
    contact_id text,
    ghl_won_status text,
    is_sales_call boolean,
    intent smallint,
    call_date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
`

// tid, contato, outcome, won, is_sales_call, data, nota, intent
const FIXTURE: Array<[string, string | null, string, string | null, boolean, string, number | null, number | null]> = [
  // (1) o bug do carimbo: 6 calls do mesmo lead, 1 agendou, 'won' em todas
  [T1, 'L1', 'closed', 'won', true, '2026-03-02', 80, 4],
  [T1, 'L1', 'not_closed', 'won', true, '2026-03-03', 80, 4],
  [T1, 'L1', 'not_closed', 'won', true, '2026-03-04', 80, 4],
  [T1, 'L1', 'not_closed', 'won', true, '2026-03-05', 80, 4],
  [T1, 'L1', 'not_closed', 'won', true, '2026-03-06', 80, 4],
  [T1, 'L1', 'not_closed', 'won', true, '2026-03-06', 80, 4],
  // (2) comprou sem nunca ter agendado
  [T1, 'L2', 'not_closed', 'won', true, '2026-03-03', 60, 2],
  // (3) agendou e não comprou
  [T1, 'L3', 'closed', null, true, '2026-03-04', 90, 5],
  // (4) call sem contact_id, mesmo sendo closed + won
  [T1, null, 'closed', 'won', true, '2026-03-04', 70, 3],
  // (5) o mesmo lead atendido por dois vendedores
  [T1, 'L5', 'closed', 'won', true, '2026-03-05', 85, 5],
  [T2, 'L5', 'closed', 'won', true, '2026-03-05', 85, 5],
  // (6) não é call de venda
  [T2, 'L6', 'closed', 'won', false, '2026-03-05', 10, 0],
  // (7) reagendou: 3 closed do mesmo lead
  [T2, 'L7', 'closed', null, true, '2026-03-06', 75, 3],
  [T2, 'L7', 'closed', null, true, '2026-03-06', 75, 3],
  [T2, 'L7', 'closed', null, true, '2026-03-06', 75, 3],
  // semana seguinte — exercita o recorte semanal e a call sem nota
  [T1, 'L8', 'closed', 'won', true, '2026-03-09', 100, 5],
  [T1, 'L9', 'not_closed', null, true, '2026-03-10', null, null],
]

let db: PGlite
let migrationSql: string

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SCHEMA)

  await db.exec(`
    insert into public.organizations (id, name) values ('${ORG}', 'Org Teste');
    insert into public.rubrics (id, name) values ('22222222-2222-2222-2222-222222222222', 'R');
    insert into public.users (id) values
      ('44444444-4444-4444-4444-444444444441'),
      ('44444444-4444-4444-4444-444444444442');
    insert into public.trainers (id, user_id, org_id) values
      ('${T1}', '44444444-4444-4444-4444-444444444441', '${ORG}'),
      ('${T2}', '44444444-4444-4444-4444-444444444442', '${ORG}');
  `)

  for (const [tid, cid, outcome, won, sales, date, score, intent] of FIXTURE) {
    await db.query(
      `insert into public.calls
         (rubric_id, org_id, trainer_id, trainer_name, trainer_email, transcript,
          overall_score, summary, strengths, improvements,
          call_outcome, contact_id, ghl_won_status, is_sales_call, intent, call_date)
       values ('22222222-2222-2222-2222-222222222222', $1, $2, 'T', 't@x.dev', 'x',
               $3, 'x', array['x'], array['x'], $4, $5, $6, $7, $8, $9)`,
      [ORG, tid, score, outcome, cid, won, sales, intent, date],
    )
  }

  // A migration sobe DEPOIS das calls — em produção é assim, e é o que dá ao
  // backfill algo pra reconstruir.
  migrationSql = readFileSync(MIGRATION, 'utf8')
  await db.exec(migrationSql)
}, 120_000)

afterAll(async () => {
  await db?.close()
})

// ─── org_won_rate ────────────────────────────────────────────────────────────

describe('org_won_rate — contagem por lead', () => {
  const wonRate = async () =>
    (await db.query<{ trainer_id: string | null; closed_leads: number; won_leads: number }>(
      `select trainer_id, closed_leads::int as closed_leads, won_leads::int as won_leads
       from public.org_won_rate($1)`,
      [ORG],
    )).rows

  it('lead com 6 calls e 1 venda conta 1, não 6 — o carimbo do GHL não infla', async () => {
    const org = (await wonRate()).find((r) => r.trainer_id === null)!
    // Agendaram: L1, L3, L5, L7, L8 = 5. Compraram: L1, L5, L8 = 3.
    expect([org.won_leads, org.closed_leads]).toEqual([3, 5])
  })

  it('lead que comprou sem nunca agendar fica fora dos dois lados', async () => {
    // L2 tem ghl_won_status='won' e nenhuma call closed. Se entrasse só no
    // numerador, o rate passaria de 100%.
    const org = (await wonRate()).find((r) => r.trainer_id === null)!
    expect(org.won_leads).toBeLessThanOrEqual(org.closed_leads)
  })

  it('call sem contact_id não entra em nenhum dos lados', async () => {
    const org = (await wonRate()).find((r) => r.trainer_id === null)!
    // Se a call sem contato contasse, closed_leads seria 6.
    expect(org.closed_leads).toBe(5)
  })

  it('3 calls closed do mesmo lead valem 1 lead', async () => {
    const t2 = (await wonRate()).find((r) => r.trainer_id === T2)!
    // L7 tem 3 closed; junto com L5 dá 2 leads, não 4.
    expect(t2.closed_leads).toBe(2)
  })

  it('call marcada como não-venda é ignorada', async () => {
    const t2 = (await wonRate()).find((r) => r.trainer_id === T2)!
    // L6 é closed + won mas is_sales_call=false; se contasse, seria 3 e 2.
    expect([t2.won_leads, t2.closed_leads]).toEqual([1, 2])
  })

  it('a org NÃO é a soma dos vendedores — lead atendido por dois conta em cada um', async () => {
    const rows = await wonRate()
    const org = rows.find((r) => r.trainer_id === null)!
    const soma = rows.filter((r) => r.trainer_id !== null)
      .reduce((s, r) => s + r.closed_leads, 0)
    expect(soma).toBe(6)
    expect(org.closed_leads).toBe(5)
  })

  it('won_leads <= closed_leads em toda linha', async () => {
    for (const r of await wonRate()) {
      expect(r.won_leads).toBeLessThanOrEqual(r.closed_leads)
    }
  })
})

// ─── Backfill ────────────────────────────────────────────────────────────────

describe('backfill', () => {
  it('a migration reconstrói o histórico e marca como backfill', async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.call_stats_weekly where source='backfill'`)
    expect(rows[0].n).toBeGreaterThan(0)
  })

  it('nada nasce marcado live', async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.call_stats_weekly where source='live'`)
    expect(rows[0].n).toBe(0)
  })

  it('reaplicar a migration não refaz o backfill', async () => {
    const antes = (await db.query<{ n: number }>(
      `select count(*)::int as n from public.call_stats_weekly where source='backfill'`)).rows[0].n
    await db.exec(migrationSql)
    const depois = (await db.query<{ n: number }>(
      `select count(*)::int as n from public.call_stats_weekly where source='backfill'`)).rows[0].n
    expect(depois).toBe(antes)
  })
})

// ─── Agregado semanal ────────────────────────────────────────────────────────

describe('call_stats_weekly — os números da semana', () => {
  const semana = async (wk: string) =>
    (await db.query<Record<string, number>>(
      `select total_calls, closed_calls, closed_leads, won_leads,
              score_count, avg_score::float as avg_score
       from public.call_stats_weekly
       where week_start = $1 and trainer_id is null
       order by snapshot_at desc limit 1`, [wk])).rows[0]

  it('conta as calls da semana e exclui a não-venda', async () => {
    // 15 linhas na semana, menos L6 que não é call de venda.
    expect((await semana('2026-03-02')).total_calls).toBe(14)
  })

  it('separa closed_calls (por call) de closed_leads (por lead)', async () => {
    const s = await semana('2026-03-02')
    // 8 calls closed, mas só 4 leads distintos agendaram.
    expect([s.closed_calls, s.closed_leads]).toEqual([8, 4])
  })

  it('won_leads conta só quem agendou naquela semana', async () => {
    expect((await semana('2026-03-02')).won_leads).toBe(2)
  })

  it('score_count ignora call sem nota, e a média não é afundada por ela', async () => {
    const s = await semana('2026-03-09')
    // 2 calls na semana, uma sem nota. A média é 100, não 50.
    expect(s.total_calls).toBe(2)
    expect(s.score_count).toBe(1)
    expect(s.avg_score).toBe(100)
  })
})

// ─── Escrita incremental ─────────────────────────────────────────────────────

describe('carimbo incremental', () => {
  it('rodada sem mudança nenhuma não grava linha', async () => {
    const antes = (await db.query<{ n: number }>(
      `select count(*)::int as n from public.call_stats_weekly`)).rows[0].n
    await db.query(`select * from public.stamp_call_stats_weekly()`)
    const depois = (await db.query<{ n: number }>(
      `select count(*)::int as n from public.call_stats_weekly`)).rows[0].n
    expect(depois).toBe(antes)
  })

  it('com o cursor à frente de tudo, nem recalcula', async () => {
    const { rows } = await db.query<{ weeks_dirty: string }>(
      `select weeks_dirty from public.stamp_call_stats_weekly(now())`)
    expect(Number(rows[0].weeks_dirty)).toBe(0)
  })

  it('venda que chega depois recalcula a semana ANTIGA do agendamento', async () => {
    // L3 agendou em 02/03 e compra agora. O que muda é ghl_won_status numa
    // call daquela semana — mas a regra tem que valer mesmo quando a venda
    // aparece numa call de outra semana.
    await db.query(`update public.calls set ghl_won_status='won' where contact_id='L3'`)
    await db.query(`select * from public.stamp_call_stats_weekly()`)

    const { rows } = await db.query<{ won_leads: number }>(
      `select distinct on (trainer_id, week_start) won_leads
       from public.call_stats_weekly
       where week_start='2026-03-02' and trainer_id is null
       order by trainer_id, week_start desc, snapshot_at desc`)
    expect(rows[0].won_leads).toBe(3)
  })

  it('a leitura anterior continua no banco', async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.call_stats_weekly
       where week_start='2026-03-02' and trainer_id is null`)
    expect(rows[0].n).toBeGreaterThan(1)
  })

  it('vendedor que perde todas as calls da semana é zerado, não congelado', async () => {
    const atual = async () =>
      (await db.query<{ total_calls: number }>(
        `select distinct on (trainer_id, week_start) total_calls
         from public.call_stats_weekly
         where week_start='2026-03-09' and trainer_id = $1
         order by trainer_id, week_start desc, snapshot_at desc`, [T1])).rows[0]

    // T1 tem 2 calls na semana de 09/03.
    expect((await atual()).total_calls).toBe(2)

    // Todas viram não-venda. A org continua com calls de outros vendedores
    // em outras semanas, então é só a linha DELE que fica órfã.
    await db.query(
      `update public.calls set is_sales_call = false where call_date >= '2026-03-09'`)
    await db.query(`select * from public.stamp_call_stats_weekly()`)

    expect((await atual()).total_calls).toBe(0)
  })
})

// ─── Garantias de banco ──────────────────────────────────────────────────────

describe('garantias que não dependem da aplicação lembrar', () => {
  it('o trigger sobrescreve o updated_at que a aplicação mandou', async () => {
    await db.query(`update public.calls set updated_at='2000-01-01' where contact_id='L2'`)
    const { rows } = await db.query<{ updated_at: string }>(
      `select updated_at from public.calls where contact_id='L2' limit 1`)
    expect(new Date(rows[0].updated_at).getFullYear()).toBeGreaterThan(2020)
  })

  it('nem service_role consegue UPDATE em call_stats_weekly', async () => {
    await db.exec(`set role service_role`)
    await expect(
      db.query(`update public.call_stats_weekly set won_leads = 999`),
    ).rejects.toThrow()
    await db.exec(`reset role`)
  })

  it('nem service_role consegue DELETE em call_stats_weekly', async () => {
    await db.exec(`set role service_role`)
    await expect(
      db.query(`delete from public.call_stats_weekly`),
    ).rejects.toThrow()
    await db.exec(`reset role`)
  })
})
