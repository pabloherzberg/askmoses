/**
 * TC — migration 125 (Won por lead) num Postgres de verdade (PGlite).
 *
 * Sobe a cadeia real: 107 (org_won_rate, carimbo semanal) → 116a (trilha) →
 * 117 → 125, contra um schema mínimo que imita prod.
 *
 * Cobre:
 *  1. A 125 aplica sem erro e é idempotente
 *  2. apply_ghl_lead_status: calls herdam o status; Won é definitivo (lost ou
 *     exclusão depois do Won não rebaixa, e a divergência fica registrada)
 *  3. Won Rate: lead fechado só conta se o Won for posterior à primeira call
 *     fechada — inclusive no caso K9 (1/9, Michael Hemry)
 *  4. Stage 2: call de venda mais recente ANTERIOR ao Won; sem ela, nada
 *  5. Backfill (p_applied_by): trilha antes do UPDATE; Stage 2 automático fora
 *     da regra é removido; manual fica; se a trilha falhar, nada muda
 *  6. Carimbo semanal: won_leads com a mesma regra
 *  7. ghl_leads_to_revisit e ghl_rejected_calls
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (f: string) => readFileSync(resolve(process.cwd(), 'scripts', f), 'utf8')
const M107 = read('107_won_rate_and_weekly_stats.sql')
const M116A = read('116a_calls_data_corrections.sql')
const M117 = read('117_stage2_from_ghl_won.sql')
const M125 = read('125_ghl_won_por_lead.sql')

const ORG = '11111111-1111-1111-1111-111111111111'
const T1 = '33333333-3333-3333-3333-333333333331'
const RUBRIC = '22222222-2222-2222-2222-222222222222'

// Mesmo schema do tc-won-rate-sql + as colunas do GHL e do Stage 2.
const SCHEMA = `
  create role anon;
  create role authenticated;
  create role service_role;

  create type call_outcome_enum as enum ('closed', 'not_closed');

  create table public.organizations (
    id uuid primary key default gen_random_uuid(), name text);
  create table public.users (id uuid primary key default gen_random_uuid());
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
    trainer_name text not null default 'T',
    trainer_email text not null default 't@x.dev',
    transcript text not null default 'x',
    overall_score numeric(4,1),
    summary text not null default 'x',
    strengths text[] not null default array['x'],
    improvements text[] not null default array['x'],
    call_outcome call_outcome_enum,
    contact_id text,
    ghl_won_status text,
    ghl_won_at timestamptz,
    ghl_opportunity_id text,
    is_sales_call boolean,
    intent smallint,
    call_date date,
    scoring_status text,
    stage2_outcome text check (stage2_outcome is null or stage2_outcome in ('paying','not_paying','pending')),
    became_paying_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
`

let db: PGlite
let seq = 0
const id = () => `aaaaaaaa-0000-0000-0000-${String(++seq).padStart(12, '0')}`

async function call(c: {
  contact: string
  at: string
  outcome?: 'closed' | 'not_closed' | null
  sales?: boolean | null
  won?: string | null
  wonAt?: string | null
  stage2?: string | null
}): Promise<string> {
  const callId = id()
  await db.query(
    `insert into public.calls
       (id, rubric_id, org_id, trainer_id, contact_id, created_at, call_outcome,
        is_sales_call, ghl_won_status, ghl_won_at, stage2_outcome)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [callId, RUBRIC, ORG, T1, c.contact, c.at, c.outcome ?? null,
     c.sales === undefined ? true : c.sales, c.won ?? null, c.wonAt ?? null, c.stage2 ?? null],
  )
  return callId
}

type Applied = {
  status: string
  won_at: Date | null
  divergence: string | null
  calls_updated: number
  stage2_removed: number
  stage2_marked: string | null
}

async function apply(contact: string, ghl: string, wonAt: string | null = null, appliedBy: string | null = null) {
  const r = await db.query<Applied>(
    `select * from public.apply_ghl_lead_status($1, $2, $3, $4, 'opp-1', 'pipe-1', 'stage-1', $5, $6)`,
    [ORG, contact, ghl, wonAt, appliedBy ? 'backfill' : 'sync', appliedBy],
  )
  return r.rows[0]
}

async function callRow(callId: string) {
  return (await db.query<{
    ghl_won_status: string | null
    ghl_won_at: Date | null
    stage2_outcome: string | null
    became_paying_at: Date | null
  }>(`select ghl_won_status, ghl_won_at, stage2_outcome, became_paying_at from public.calls where id = $1`, [callId])).rows[0]
}

async function lead(contact: string) {
  return (await db.query<{ status: string; won_at: Date | null; ghl_status: string; ghl_divergence: string | null }>(
    `select status, won_at, ghl_status, ghl_divergence from public.ghl_leads where org_id = $1 and contact_id = $2`,
    [ORG, contact],
  )).rows[0]
}

async function orgWonRate() {
  const r = await db.query<{ closed_leads: number; won_leads: number }>(
    `select closed_leads::int, won_leads::int from public.org_won_rate($1) where trainer_id is null`,
    [ORG],
  )
  return r.rows[0]
}

async function trail(appliedBy: string, callId: string) {
  return (await db.query<{ column_name: string; old_value: unknown; new_value: unknown }>(
    `select column_name, old_value, new_value from public.calls_data_corrections
     where applied_by = $1 and call_id = $2 order by column_name, created_at`,
    [appliedBy, callId],
  )).rows
}

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SCHEMA)
  await db.exec(`
    insert into public.organizations (id, name) values ('${ORG}', 'Org Teste');
    insert into public.rubrics (id, name) values ('${RUBRIC}', 'R');
    insert into public.users (id) values ('44444444-4444-4444-4444-444444444441');
    insert into public.trainers (id, user_id, org_id)
      values ('${T1}', '44444444-4444-4444-4444-444444444441', '${ORG}');
  `)
  await db.exec(M107)
  await db.exec(M116A)
  await db.exec(M117)
  await db.exec(M125)
}, 120_000)

afterAll(async () => {
  await db?.close()
})

describe('125 — aplica', () => {
  it('é idempotente (aplicar de novo não falha)', async () => {
    await expect(db.exec(M125)).resolves.toBeDefined()
  })

  it('call_moment: call_date vence created_at; sem call_date, created_at', async () => {
    const r = await db.query<{ a: Date; b: Date }>(
      `select public.call_moment('2026-09-30'::date, '2026-10-05T10:00:00Z') as a,
              public.call_moment(null, '2026-10-05T10:00:00Z') as b`,
    )
    expect(r.rows[0].a.toISOString()).toBe('2026-09-30T00:00:00.000Z')
    expect(r.rows[0].b.toISOString()).toBe('2026-10-05T10:00:00.000Z')
  })
})

describe('apply_ghl_lead_status — o lead manda, as calls herdam', () => {
  it('won: todas as calls do lead recebem won e won_at', async () => {
    const a = await call({ contact: 'A1', at: '2026-09-01T10:00:00Z', outcome: 'closed' })
    const b = await call({ contact: 'A1', at: '2026-09-02T10:00:00Z', sales: false })
    const r = await apply('A1', 'won', '2026-09-10T12:00:00Z')
    expect(r.status).toBe('won')
    expect(r.calls_updated).toBe(2)
    for (const c of [a, b]) {
      const row = await callRow(c)
      expect(row.ghl_won_status).toBe('won')
      expect(row.ghl_won_at?.toISOString()).toBe('2026-09-10T12:00:00.000Z')
    }
    expect((await lead('A1')).status).toBe('won')
  })

  it('Won é definitivo: lost depois do Won não rebaixa e registra a divergência', async () => {
    const r = await apply('A1', 'lost')
    expect(r.status).toBe('won')
    expect(r.divergence).toBe('ghl=lost')
    expect(r.calls_updated).toBe(0)
    const l = await lead('A1')
    expect([l.status, l.ghl_status, l.ghl_divergence]).toEqual(['won', 'lost', 'ghl=lost'])
    expect(l.won_at?.toISOString()).toBe('2026-09-10T12:00:00.000Z')
  })

  it('opportunity excluída (none) também não rebaixa', async () => {
    expect((await apply('A1', 'none')).status).toBe('won')
  })

  it('lead que já era won só nas calls (sem linha em ghl_leads) continua won', async () => {
    const c = await call({ contact: 'A2', at: '2026-09-01T10:00:00Z', won: 'won', wonAt: '2026-09-05T00:00:00Z' })
    const r = await apply('A2', 'open')
    expect(r.status).toBe('won')
    expect((await callRow(c)).ghl_won_status).toBe('won')
  })

  it('lost → won: vira won (só o won é definitivo)', async () => {
    const c = await call({ contact: 'A3', at: '2026-09-01T10:00:00Z' })
    expect((await apply('A3', 'lost')).status).toBe('lost')
    expect((await callRow(c)).ghl_won_status).toBe('lost')
    expect((await apply('A3', 'won', '2026-09-03T00:00:00Z')).status).toBe('won')
    expect((await callRow(c)).ghl_won_status).toBe('won')
  })

  it('open/abandoned: calls ficam sem status', async () => {
    const c = await call({ contact: 'A4', at: '2026-09-01T10:00:00Z', won: 'lost' })
    expect((await apply('A4', 'abandoned')).status).toBe('abandoned')
    expect((await callRow(c)).ghl_won_status).toBeNull()
  })

  it('status desconhecido aborta', async () => {
    await expect(apply('A4', 'quase-won')).rejects.toThrow(/status desconhecido/)
  })
})

describe('Stage 2 — call de venda mais recente ANTERIOR ao Won', () => {
  it('marca a call de venda anterior ao Won, ignorando não-venda e call posterior', async () => {
    const venda1 = await call({ contact: 'S1', at: '2026-09-01T10:00:00Z', outcome: 'closed' })
    const venda2 = await call({ contact: 'S1', at: '2026-09-03T10:00:00Z', outcome: 'not_closed', sales: null })
    const naoVenda = await call({ contact: 'S1', at: '2026-09-04T10:00:00Z', sales: false })
    const depois = await call({ contact: 'S1', at: '2026-09-09T10:00:00Z', outcome: 'closed' })
    const r = await apply('S1', 'won', '2026-09-05T00:00:00Z')
    expect(r.stage2_marked).toBe(venda2) // is_sales_call NULL conta como venda
    const row = await callRow(venda2)
    expect(row.stage2_outcome).toBe('paying')
    expect(row.became_paying_at?.toISOString()).toBe('2026-09-05T00:00:00.000Z')
    for (const c of [venda1, naoVenda, depois]) expect((await callRow(c)).stage2_outcome).toBeNull()
  })

  it('sem call de venda antes do Won: lead won sem Stage 2', async () => {
    const naoVenda = await call({ contact: 'S2', at: '2026-09-01T10:00:00Z', sales: false })
    const posterior = await call({ contact: 'S2', at: '2026-09-20T10:00:00Z', outcome: 'closed' })
    const r = await apply('S2', 'won', '2026-09-10T00:00:00Z')
    expect(r.status).toBe('won')
    expect(r.stage2_marked).toBeNull()
    for (const c of [naoVenda, posterior]) expect((await callRow(c)).stage2_outcome).toBeNull()
  })

  it('Stage 2 manual na call alvo é soberano', async () => {
    const c = await call({ contact: 'S3', at: '2026-09-01T10:00:00Z', stage2: 'pending' })
    expect((await apply('S3', 'won', '2026-09-10T00:00:00Z')).stage2_marked).toBeNull()
    expect((await callRow(c)).stage2_outcome).toBe('pending')
  })

  it('sync do dia a dia grava a trilha do Stage 2 como ghl_won_sync', async () => {
    const c = await call({ contact: 'S4', at: '2026-09-01T10:00:00Z' })
    await apply('S4', 'won', '2026-09-10T00:00:00Z')
    expect((await trail('ghl_won_sync', c)).map((t) => t.column_name)).toEqual(['became_paying_at', 'stage2_outcome'])
  })
})

describe('Backfill (p_applied_by) — trilha e revisão do Stage 2', () => {
  const BF = '125_ghl_won_por_lead_backfill'

  it('grava a trilha de ghl_won_status/ghl_won_at antes de alterar a call', async () => {
    const c = await call({ contact: 'B1', at: '2026-09-01T10:00:00Z' })
    await apply('B1', 'won', '2026-09-10T00:00:00Z', BF)
    const t = await trail(BF, c)
    expect(t.map((x) => x.column_name)).toEqual(['ghl_won_at', 'ghl_won_status', 'became_paying_at', 'stage2_outcome'].sort())
    expect(t.find((x) => x.column_name === 'ghl_won_status')?.new_value).toBe('won')
  })

  it('remove Stage 2 automático numa call POSTERIOR ao Won e marca a certa', async () => {
    const antes = await call({ contact: 'B2', at: '2026-09-01T10:00:00Z' })
    const depois = await call({ contact: 'B2', at: '2026-09-20T10:00:00Z', won: 'won', wonAt: '2026-09-10T00:00:00Z', stage2: 'paying' })
    // trilha que a 118 deixou: é automático
    await db.query(
      `insert into public.calls_data_corrections (call_id, column_name, old_value, new_value, applied_by)
       values ($1, 'stage2_outcome', 'null', '"paying"', '118_stage2_won_backfill')`,
      [depois],
    )
    const r = await apply('B2', 'won', '2026-09-10T00:00:00Z', BF)
    expect(r.stage2_removed).toBe(1)
    expect(r.stage2_marked).toBe(antes)
    expect((await callRow(depois)).stage2_outcome).toBeNull()
    expect((await callRow(antes)).stage2_outcome).toBe('paying')
    const removida = await trail(BF, depois)
    expect(removida.find((x) => x.column_name === 'stage2_outcome')?.old_value).toBe('paying')
  })

  it('Stage 2 automático sem nenhuma call de venda anterior ao Won: removido, nada marcado', async () => {
    const c = await call({ contact: 'B3', at: '2026-09-20T10:00:00Z', won: 'won', wonAt: '2026-09-10T00:00:00Z', stage2: 'paying' })
    await db.query(
      `insert into public.calls_data_corrections (call_id, column_name, old_value, new_value, applied_by)
       values ($1, 'stage2_outcome', 'null', '"paying"', 'ghl_won_sync')`,
      [c],
    )
    const r = await apply('B3', 'won', '2026-09-10T00:00:00Z', BF)
    expect([r.stage2_removed, r.stage2_marked]).toEqual([1, null])
  })

  it('paying manual (sem trilha automática) não é tocado', async () => {
    const c = await call({ contact: 'B4', at: '2026-09-20T10:00:00Z', stage2: 'paying' })
    const r = await apply('B4', 'won', '2026-09-10T00:00:00Z', BF)
    expect(r.stage2_removed).toBe(0)
    expect((await callRow(c)).stage2_outcome).toBe('paying')
  })

  it('se a trilha falhar, nada muda (nem o lead, nem as calls)', async () => {
    const c = await call({ contact: 'B5', at: '2026-09-01T10:00:00Z' })
    await db.exec(`
      create function public._falha_trilha() returns trigger language plpgsql as
        $f$ begin raise exception 'trilha indisponível'; end $f$;
      create trigger _falha before insert on public.calls_data_corrections
        for each row execute function public._falha_trilha();
    `)
    try {
      await expect(apply('B5', 'won', '2026-09-10T00:00:00Z', BF)).rejects.toThrow(/trilha indisponível/)
    } finally {
      await db.exec(`drop trigger _falha on public.calls_data_corrections; drop function public._falha_trilha();`)
    }
    expect((await callRow(c)).ghl_won_status).toBeNull()
    expect(await lead('B5')).toBeUndefined()
  })
})

describe('Won Rate — Won só conta se posterior à primeira call fechada', () => {
  // Org isolada: os describes acima também criam calls 'closed'.
  const ORG_K9 = '55555555-5555-5555-5555-555555555555'

  it('caso K9 (prod, 01/10/2026): 0/9 hoje → 1/9, só Michael Hemry', async () => {
    await db.query(`insert into public.organizations (id, name) values ($1, 'K9')`, [ORG_K9])
    // [lead, primeira call fechada, Won no GHL (null = sem Won)]
    const K9: Array<[string, string, string | null]> = [
      ['marli', '2026-09-29T20:57:09Z', null],
      ['tiffany', '2026-09-24T22:23:42Z', '2023-03-09T19:26:39Z'],
      ['ginger', '2026-09-29T17:58:20Z', null],
      ['denise', '2026-09-29T22:33:14Z', null],
      ['alexis', '2026-09-29T21:31:11Z', '2026-08-25T03:58:43Z'],
      ['michael', '2026-09-30T01:01:55Z', '2026-09-30T20:13:52Z'],
      ['reynold', '2026-09-30T22:19:54Z', null],
      ['sherry', '2026-09-23T20:07:24Z', null],
      ['julie', '2026-09-23T21:32:20Z', '2026-08-14T22:41:13Z'],
    ]
    for (const [contact, at] of K9) {
      await db.query(
        `insert into public.calls (rubric_id, org_id, trainer_id, contact_id, created_at, call_outcome, is_sales_call)
         values ($1, $2, $3, $4, $5, 'closed', true)`,
        [RUBRIC, ORG_K9, T1, contact, at],
      )
    }
    const rate = async () => (await db.query<{ closed_leads: number; won_leads: number }>(
      `select closed_leads::int, won_leads::int from public.org_won_rate($1) where trainer_id is null`, [ORG_K9],
    )).rows[0]
    expect(await rate()).toEqual({ closed_leads: 9, won_leads: 0 })

    for (const [contact, , wonAt] of K9) {
      if (!wonAt) continue
      await db.query(
        `select * from public.apply_ghl_lead_status($1, $2, 'won', $3, 'o', 'p', 's', 'backfill', null)`,
        [ORG_K9, contact, wonAt],
      )
    }
    expect(await rate()).toEqual({ closed_leads: 9, won_leads: 1 })
  })

  it('a org de teste: Won antes da call fechada não conta, depois conta', async () => {
    const before = await orgWonRate()
    await call({ contact: 'W1', at: '2026-09-10T10:00:00Z', outcome: 'closed' })
    await apply('W1', 'won', '2026-09-01T00:00:00Z') // Won ANTES da call fechada
    await call({ contact: 'W2', at: '2026-09-10T10:00:00Z', outcome: 'closed' })
    await apply('W2', 'won', '2026-09-11T00:00:00Z') // depois
    const after = await orgWonRate()
    expect(after.closed_leads - before.closed_leads).toBe(2)
    expect(after.won_leads - before.won_leads).toBe(1)
  })
})

describe('Carimbo semanal — won_leads com a mesma regra', () => {
  it('na semana do agendamento, conta só o lead com Won posterior', async () => {
    const ORG_W = '66666666-6666-6666-6666-666666666666'
    await db.query(`insert into public.organizations (id, name) values ($1, 'W')`, [ORG_W])
    for (const [contact, wonAt] of [['wk1', '2026-08-01T00:00:00Z'], ['wk2', '2026-08-20T00:00:00Z']]) {
      await db.query(
        `insert into public.calls (rubric_id, org_id, trainer_id, contact_id, call_date, call_outcome,
                                   is_sales_call, ghl_won_status, ghl_won_at)
         values ($1, $2, $3, $4, '2026-08-10', 'closed', true, 'won', $5)`,
        [RUBRIC, ORG_W, T1, contact, wonAt],
      )
    }
    await db.query(`select * from public.stamp_call_stats_weekly('-infinity')`)
    const r = await db.query<{ closed_leads: number; won_leads: number }>(
      `select closed_leads, won_leads from public.call_stats_weekly
       where org_id = $1 and trainer_id is null and week_start = '2026-08-10'
       order by snapshot_at desc limit 1`,
      [ORG_W],
    )
    expect(r.rows[0]).toEqual({ closed_leads: 2, won_leads: 1 })
  })
})

describe('Sync diário e calls recusadas', () => {
  it('ghl_leads_to_revisit: não traz lead won; nunca consultado vem primeiro', async () => {
    const ORG_R = '77777777-7777-7777-7777-777777777777'
    await db.query(`insert into public.organizations (id, name) values ($1, 'R')`, [ORG_R])
    for (const contact of ['r-won', 'r-velho', 'r-novo']) {
      await db.query(
        `insert into public.calls (rubric_id, org_id, contact_id) values ($1, $2, $3)`,
        [RUBRIC, ORG_R, contact],
      )
    }
    await db.query(
      `select * from public.apply_ghl_lead_status($1, 'r-won', 'won', now(), 'o', 'p', 's', 'sync', null)`, [ORG_R])
    await db.query(
      `select * from public.apply_ghl_lead_status($1, 'r-velho', 'open', null, null, null, null, 'sync', null)`, [ORG_R])
    const r = await db.query<{ contact_id: string }>(
      `select contact_id from public.ghl_leads_to_revisit($1, 10)`, [ORG_R])
    expect(r.rows.map((x) => x.contact_id)).toEqual(['r-novo', 'r-velho'])
  })

  it('ghl_rejected_calls: o mesmo reenvio do GHL conta uma vez', async () => {
    const ins = `insert into public.ghl_rejected_calls (org_id, contact_id, external_call_id, reason)
                 values ($1, 'c', 'ext-1', 'contact_already_won') on conflict do nothing`
    await db.query(ins, [ORG])
    await db.query(ins, [ORG])
    const n = (await db.query<{ n: number }>(
      `select count(*)::int as n from public.ghl_rejected_calls where org_id = $1`, [ORG])).rows[0].n
    expect(n).toBe(1)
  })

  it('só service_role executa as funções novas', async () => {
    const r = await db.query<{ anon: boolean; svc: boolean }>(
      `select has_function_privilege('anon', 'public.apply_ghl_lead_status(uuid, text, text, timestamptz, text, text, text, text, text)', 'execute') as anon,
              has_function_privilege('service_role', 'public.apply_ghl_lead_status(uuid, text, text, timestamptz, text, text, text, text, text)', 'execute') as svc`,
    )
    expect(r.rows[0]).toEqual({ anon: false, svc: true })
  })
})
