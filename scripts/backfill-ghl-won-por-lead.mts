import { createClient } from '@supabase/supabase-js'
import { fetchContactOpportunities } from '@/lib/services/ghl-api'
import { resolveLeadFromOpportunities, type ResolvedLead } from '@/lib/services/ghl-won-sync'

// Backfill único do Won por lead (migration 125), para todas as orgs com GHL.
//
// PADRÃO: PRÉVIA, NÃO GRAVA. Consulta no GHL as opportunities de cada contato
// que tem call (a mesma busca e a mesma resolução do sync — lib/services), e
// calcula, pelas regras da 125, o que mudaria:
//   - leads que viram Won (e "deixam Won", que pela regra 1 é sempre 0;
//     a divergência do GHL aparece à parte, só para diagnóstico)
//   - calls cujo ghl_won_status / ghl_won_at mudam
//   - Won Rate antes (regra antiga) e depois (Won posterior à 1ª call fechada)
//   - Stage 2: entra / sai / troca de call (só marcações automáticas; um
//     'paying' sem trilha automática é manual e o lead fica intocado)
//
// GRAVAR (--apply) exige as contagens da prévia, e aborta antes de gravar se
// não baterem: --expect-new-won N --expect-calls N --expect-s2-add N
// --expect-s2-remove N --expect-s2-move N. Cada lead passa por
// apply_ghl_lead_status com p_applied_by (trilha em calls_data_corrections
// ANTES do UPDATE, na mesma transação). O resultado de cada lead é comparado
// com o plano; na primeira divergência o script para.
//
// Momento da call = call_date (00:00 UTC) se houver; senão created_at.
//
// Uso:
//   npx tsx scripts/backfill-ghl-won-por-lead.mts [ORG_ID] [--json arquivo]
//   npx tsx scripts/backfill-ghl-won-por-lead.mts --apply --expect-new-won 30 ...

const APPLIED_BY = '125_ghl_won_por_lead_backfill'
const AUTO_STAGE2 = ['ghl_won_sync', '118_stage2_won_backfill']
const CONCURRENCY = 4

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const APPLY = args.includes('--apply')
const JSON_OUT = flag('--json')
const valued = new Set(['--json', '--expect-new-won', '--expect-calls', '--expect-s2-add', '--expect-s2-remove', '--expect-s2-move'])
const ORG_ID = args.find((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]))

// ── Tipos e regras (espelham a 125) ─────────────────────────────────────────
type CallRow = {
  id: string
  contact_id: string
  lead_name: string | null
  call_outcome: string | null
  is_sales_call: boolean | null
  call_date: string | null
  created_at: string
  ghl_won_status: string | null
  ghl_won_at: string | null
  stage2_outcome: string | null
}

type Plan = {
  contactId: string
  lead: string | null
  ghl: ResolvedLead
  prevWon: boolean
  status: string
  wonAt: string | null
  divergence: string | null
  callsChanged: number
  s2Removed: number
  s2Marked: string | null
  s2Kind: 'add' | 'remove' | 'move' | 'manual' | null
  closed: boolean
  wonBefore: boolean // regra antiga: lead fechado com alguma call won
  wonAfter: boolean // regra nova: Won posterior à 1ª call fechada
}

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : null)
const moment = (c: CallRow) => new Date(c.call_date ? `${c.call_date}T00:00:00Z` : c.created_at).getTime()
const isSales = (c: CallRow) => c.is_sales_call !== false
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

function planLead(
  contactId: string,
  calls: CallRow[],
  ghl: ResolvedLead,
  prevLead: { status: string; won_at: string | null } | undefined,
  autoPaying: Set<string>,
): Plan {
  const wonCalls = calls.filter((c) => c.ghl_won_status === 'won')
  const prevWon = prevLead?.status === 'won' || wonCalls.length > 0
  const callsWonAt = wonCalls.map((c) => c.ghl_won_at).filter((x): x is string => !!x).sort().at(-1) ?? null
  const prevWonAt = prevLead?.won_at ?? callsWonAt

  let status: string
  let wonAt: string | null = null
  let divergence: string | null = null
  if (ghl.ghlStatus === 'won') {
    status = 'won'
    wonAt = ghl.wonAt ?? prevWonAt ?? new Date().toISOString()
  } else if (prevWon) {
    status = 'won'
    wonAt = prevWonAt
    divergence = `ghl=${ghl.ghlStatus}`
  } else {
    status = ghl.ghlStatus
  }

  const callStatus = status === 'won' || status === 'lost' ? status : null
  const callWonAt = status === 'won' ? wonAt : null
  const callsChanged = calls.filter(
    (c) => (c.ghl_won_status ?? null) !== callStatus || ms(c.ghl_won_at) !== ms(callWonAt),
  ).length

  // Stage 2 (só lead won)
  let s2Removed = 0
  let s2Marked: string | null = null
  let s2Kind: Plan['s2Kind'] = null
  if (status === 'won') {
    const paying = calls.filter((c) => c.stage2_outcome === 'paying')
    if (paying.some((c) => !autoPaying.has(c.id))) {
      s2Kind = 'manual'
    } else {
      const wonMs = ms(wonAt)
      const target = wonMs === null
        ? undefined
        : calls
            .filter((c) => isSales(c) && moment(c) < wonMs)
            .sort((a, b) => moment(b) - moment(a) || b.created_at.localeCompare(a.created_at))[0]
      s2Removed = paying.filter((c) => c.id !== target?.id).length
      if (target && target.stage2_outcome === null) s2Marked = target.id
      s2Kind = s2Marked && s2Removed > 0 ? 'move' : s2Marked ? 'add' : s2Removed > 0 ? 'remove' : null
    }
  }

  const closedCalls = calls.filter((c) => c.call_outcome === 'closed' && isSales(c))
  const closed = closedCalls.length > 0
  const firstClosed = closed ? Math.min(...closedCalls.map(moment)) : null
  const wonAtMs = ms(callWonAt)

  return {
    contactId,
    lead: calls[0]?.lead_name ?? null,
    ghl,
    prevWon,
    status,
    wonAt,
    divergence,
    callsChanged,
    s2Removed,
    s2Marked,
    s2Kind,
    closed,
    wonBefore: closed && calls.some((c) => c.ghl_won_status === 'won' && isSales(c)),
    wonAfter: closed && status === 'won' && wonAtMs !== null && firstClosed !== null && wonAtMs > firstClosed,
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) await fn(items[next++])
  }))
}

async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// ── Dados ───────────────────────────────────────────────────────────────────
let orgQuery = supabase.from('organizations').select('id, name, ghl_location_id, ghl_access_token').eq('ghl_integration_enabled', true)
if (ORG_ID) orgQuery = orgQuery.eq('id', ORG_ID)
const { data: orgRows, error: orgErr } = await orgQuery
if (orgErr) throw new Error(orgErr.message)
const orgs = (orgRows ?? []).filter((o) => o.ghl_access_token && o.ghl_location_id)
if (orgs.length === 0) {
  console.error('Nenhuma org com GHL ativo e credenciais.')
  process.exit(1)
}

// A 125 já está no banco? A prévia não depende dela: sem ghl_leads, o estado
// atual vem só das calls (ghl_won_status / ghl_won_at), que é o que existe
// hoje em prod. O --apply depende (chama apply_ghl_lead_status) e para aqui,
// antes de qualquer consulta ao GHL, se ela faltar.
// ghl_leads_to_revisit é só leitura (STABLE): prova a tabela e as funções.
// PGRST205 = tabela fora do schema cache; PGRST202 = função inexistente.
async function migration125Present(): Promise<boolean> {
  const { error } = await supabase.rpc('ghl_leads_to_revisit', {
    p_org_id: '00000000-0000-0000-0000-000000000000',
    p_limit: 0,
  })
  if (!error) return true
  if (error.code === 'PGRST202' || error.code === 'PGRST205' || /could not find/i.test(error.message)) return false
  throw new Error(`checando a migration 125: ${error.message}`)
}
const HAS_125 = await migration125Present()
if (APPLY && !HAS_125) {
  console.error(
    '\nA migration 125 (scripts/125_ghl_won_por_lead.sql) não está aplicada neste banco: ' +
      'faltam ghl_leads / apply_ghl_lead_status. O --apply precisa dela. Aplique a 125 e rode a prévia de novo. Nada foi gravado.',
  )
  process.exit(2)
}
if (!HAS_125) {
  console.error('(125 ainda não aplicada neste banco — prévia usando só o estado das calls; ghl_leads tratada como vazia)')
}

const autoPaying = new Set(
  (await selectAll<{ call_id: string }>((f, t) =>
    supabase.from('calls_data_corrections').select('call_id')
      .eq('column_name', 'stage2_outcome').in('applied_by', AUTO_STAGE2).range(f, t),
  )).map((r) => r.call_id),
)

type OrgPlan = { orgId: string; org: string; leads: Plan[]; ghlErrors: string[] }
const plans: OrgPlan[] = []

for (const org of orgs) {
  const orgId = org.id as string
  const name = (org.name as string | null) ?? orgId
  process.stderr.write(`→ ${name}… `)

  const calls = await selectAll<CallRow>((f, t) =>
    supabase.from('calls')
      .select('id, contact_id, lead_name, call_outcome, is_sales_call, call_date, created_at, ghl_won_status, ghl_won_at, stage2_outcome')
      .eq('org_id', orgId).not('contact_id', 'is', null).order('id').range(f, t),
  )
  const prevLeads = new Map(
    HAS_125
      ? (await selectAll<{ contact_id: string; status: string; won_at: string | null }>((f, t) =>
          supabase.from('ghl_leads').select('contact_id, status, won_at').eq('org_id', orgId).range(f, t),
        )).map((l) => [l.contact_id, l])
      : [],
  )

  const byContact = new Map<string, CallRow[]>()
  for (const c of calls) byContact.set(c.contact_id, [...(byContact.get(c.contact_id) ?? []), c])

  const op: OrgPlan = { orgId, org: name, leads: [], ghlErrors: [] }
  await pool([...byContact.keys()], CONCURRENCY, async (cid) => {
    try {
      const opps = await fetchContactOpportunities(org.ghl_location_id as string, org.ghl_access_token as string, cid)
      op.leads.push(planLead(cid, byContact.get(cid)!, resolveLeadFromOpportunities(opps), prevLeads.get(cid), autoPaying))
    } catch (err) {
      op.ghlErrors.push(`${cid}: ${err instanceof Error ? err.message : String(err)}`)
    }
  })
  plans.push(op)
  process.stderr.write(`${byContact.size} leads${op.ghlErrors.length ? `, ${op.ghlErrors.length} erro(s) GHL` : ''}\n`)
}

// ── Prévia ──────────────────────────────────────────────────────────────────
const count = (o: OrgPlan, f: (p: Plan) => boolean) => o.leads.filter(f).length
const rows = plans.map((o) => {
  const closed = count(o, (p) => p.closed)
  const before = count(o, (p) => p.wonBefore)
  const after = count(o, (p) => p.wonAfter)
  return {
    org: o.org.slice(0, 28),
    leads: o.leads.length,
    'erros GHL': o.ghlErrors.length,
    'Won (lead)': count(o, (p) => p.status === 'won'),
    'viram Won': count(o, (p) => p.status === 'won' && !p.prevWon),
    // Pela regra 1 é sempre 0; calculado mesmo assim para provar.
    'deixam Won': count(o, (p) => p.prevWon && p.status !== 'won'),
    'divergência GHL': count(o, (p) => !!p.divergence),
    'calls alteradas': o.leads.reduce((s, p) => s + p.callsChanged, 0),
    'Won Rate antes': `${before}/${closed} (${pct(before, closed)}%)`,
    'Won Rate depois': `${after}/${closed} (${pct(after, closed)}%)`,
    'S2 +': count(o, (p) => p.s2Kind === 'add'),
    'S2 −': count(o, (p) => p.s2Kind === 'remove'),
    'S2 troca': count(o, (p) => p.s2Kind === 'move'),
    'S2 manual': count(o, (p) => p.s2Kind === 'manual'),
  }
})

console.log(`\n${APPLY ? 'APLICAÇÃO' : 'PRÉVIA — nada foi gravado'}\n`)
console.table(rows)
const total = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (r[k] as number), 0)
const totals = {
  newWon: total('viram Won'),
  calls: total('calls alteradas'),
  s2Add: total('S2 +'),
  s2Remove: total('S2 −'),
  s2Move: total('S2 troca'),
}
console.log(
  `Total: ${total('leads')} leads · ${total('erros GHL')} erro(s) GHL · ${totals.newWon} viram Won · ${total('deixam Won')} deixam Won · ` +
    `${total('divergência GHL')} divergência(s) · ${totals.calls} calls alteradas · ` +
    `Stage 2 +${totals.s2Add} −${totals.s2Remove} troca ${totals.s2Move} · manual intocado ${total('S2 manual')}`,
)
const divergent = plans.flatMap((o) => o.leads.filter((p) => p.divergence).map((p) => ({ org: o.org, lead: p.lead, contactId: p.contactId, ghl: p.divergence, wonAt: p.wonAt })))
if (divergent.length) {
  console.log('\nWon no AskMoses, sem opportunity won no GHL hoje (continuam Won — só diagnóstico):')
  console.table(divergent)
}
const errors = plans.flatMap((o) => o.ghlErrors.map((e) => `${o.org}: ${e}`))
if (errors.length) console.log(`\nErros GHL:\n${errors.join('\n')}`)
if (JSON_OUT) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(JSON_OUT, JSON.stringify(plans, null, 2))
  console.log(`\nJSON em ${JSON_OUT}`)
}

if (!APPLY) process.exit(0)

// ── Aplicação ───────────────────────────────────────────────────────────────
if (errors.length) {
  console.error('\nHá erros de consulta ao GHL; corrija antes de aplicar.')
  process.exit(3)
}
const expected = {
  newWon: Number(flag('--expect-new-won')),
  calls: Number(flag('--expect-calls')),
  s2Add: Number(flag('--expect-s2-add')),
  s2Remove: Number(flag('--expect-s2-remove')),
  s2Move: Number(flag('--expect-s2-move')),
}
const mismatch = (Object.keys(expected) as Array<keyof typeof expected>).filter((k) => expected[k] !== totals[k])
if (mismatch.length) {
  console.error(`\nContagens diferentes das esperadas (${mismatch.map((k) => `${k}: esperado ${expected[k]}, agora ${totals[k]}`).join('; ')}). Nada foi gravado.`)
  process.exit(3)
}

let applied = 0
for (const o of plans) {
  for (const p of o.leads) {
    const { data, error } = await supabase.rpc('apply_ghl_lead_status', {
      p_org_id: o.orgId,
      p_contact_id: p.contactId,
      p_ghl_status: p.ghl.ghlStatus,
      p_won_at: p.ghl.wonAt,
      p_opportunity_id: p.ghl.opportunityId,
      p_pipeline_id: p.ghl.pipelineId,
      p_stage_id: p.ghl.stageId,
      p_source: 'backfill',
      p_applied_by: APPLIED_BY,
    })
    if (error) {
      console.error(`\nFalhou em ${o.org} / ${p.contactId}: ${error.message}. ${applied} lead(s) aplicados antes; parando.`)
      process.exit(4)
    }
    const r = (Array.isArray(data) ? data[0] : data) as { status: string; calls_updated: number; stage2_removed: number; stage2_marked: string | null }
    const diff =
      r.status !== p.status || Number(r.calls_updated) !== p.callsChanged ||
      Number(r.stage2_removed) !== p.s2Removed || (r.stage2_marked ?? null) !== p.s2Marked
    if (diff) {
      console.error(`\nResultado diferente do plano em ${o.org} / ${p.contactId}:`, { plano: p, resultado: r })
      console.error(`${applied + 1} lead(s) aplicados (este incluído, com trilha). Parando.`)
      process.exit(5)
    }
    applied += 1
  }
}
console.log(`\nAplicado: ${applied} leads, trilha em calls_data_corrections (applied_by = ${APPLIED_BY}).`)
