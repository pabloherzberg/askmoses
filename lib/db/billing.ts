import { createAdminClient } from "@/lib/supabase/admin";
import type {
  BillingCycle,
  BillingOrgRow,
  BillingPeriodRange,
  BillingStatus,
  BillingUsage,
  BillingValueByOrg,
} from "@/lib/types";

// Camada de dados da feature de Billing — agrega calls.duration_seconds /
// created_at do Supabase real. Substitui os mocks MSW. Restrita às rotas de
// Billing (admin vê tudo; owner é filtrado na route, não aqui).
//
// Regras de cálculo (alinhadas ao handoff §6/§7):
//  • Minutos faturáveis por call = ceil(duration_seconds / 60), e calls com
//    duration_seconds < 30 NÃO são faturadas (0 min). NULL = não faturável.
//  • Custo = minutos faturáveis × rate_per_minute (por org, da coluna).
//  • LLM cost / COGS agora é REAL: soma de llm_usage_events.cost_usd por org
//    (ver aggregateLlmCost + migrations 088/089). Substitui o antigo chute de
//    30% do faturado. Admin only — owner nunca recebe cogs/llmCost.

const PG_MAX_ROWS = 1000;

/** Limite abaixo do qual a call não é faturada (segundos). Handoff §7. */
const MIN_BILLABLE_SECONDS = 30;

/** Tarifa default em micro-USD/min ($0,0667). Casa com a migration 082. */
const DEFAULT_RATE_MICROS = 66700;

/** Tarifa default em USD/min — fallback quando a org não tem rate setada. */
const DEFAULT_RATE_USD = DEFAULT_RATE_MICROS / 1_000_000;

/** "Copy" de How you're billed — config (regras pendentes §7). Owner only. */
export const BILLING_HOW_YOU_ARE_BILLED = [
  "$0.0667 per minute of analyzed calls (≈ $1 per 15-min call)",
  "Billed in whole minutes, rounded up",
  "Calls under 30 seconds aren't billed",
  "Charged monthly, on the calendar month",
];

// ── Helpers de janela ────────────────────────────────────────────────────────

const RANGE_DAYS: Record<BillingPeriodRange, number> = {
  "1w": 7,
  "2w": 14,
  "3w": 21,
  "1m": 30,
};

function rollingStartIso(range: BillingPeriodRange): string {
  const days = RANGE_DAYS[range] ?? 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Início do mês "YYYY-MM" em ISO/UTC (alinhado à 071). */
function monthBoundsIso(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();
  return { start, end };
}

/** "YYYY-MM" → "June 2026". */
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── Agregação de calls ───────────────────────────────────────────────────────

interface CallAgg {
  calls: number; // calls faturadas (>= MIN_BILLABLE_SECONDS)
  minutes: number; // minutos faturáveis (ceil por call, arredondado)
  durationsSeconds: number[]; // p/ avg call length
}

function emptyAgg(): CallAgg {
  return { calls: 0, minutes: 0, durationsSeconds: [] };
}

function accumulate(agg: CallAgg, durationSeconds: number | null): void {
  if (durationSeconds == null || durationSeconds < MIN_BILLABLE_SECONDS) return;
  agg.calls += 1;
  agg.minutes += Math.ceil(durationSeconds / 60);
  agg.durationsSeconds.push(durationSeconds);
}

function avgCallLengthMin(agg: CallAgg): number {
  if (agg.durationsSeconds.length === 0) return 0;
  const totalSec = agg.durationsSeconds.reduce((s, d) => s + d, 0);
  return Number((totalSec / agg.durationsSeconds.length / 60).toFixed(1));
}

type AdminSupabase = ReturnType<typeof createAdminClient>;

/**
 * Agrega calls por org num intervalo [from, to). Pagina pra não truncar no
 * limite do PostgREST. orgIds vazio → agrega todas as orgs.
 */
async function aggregateCalls(
  supabase: AdminSupabase,
  from: string,
  to: string | null,
  orgIds: string[] | null,
): Promise<Map<string, CallAgg>> {
  const byOrg = new Map<string, CallAgg>();
  let offset = 0;
  for (;;) {
    let q = supabase
      .from("calls")
      .select("org_id, duration_seconds, created_at")
      .gte("created_at", from)
      .not("org_id", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + PG_MAX_ROWS - 1);
    if (to) q = q.lt("created_at", to);
    if (orgIds && orgIds.length > 0) q = q.in("org_id", orgIds);

    const { data, error } = await q;
    if (error) throw new Error(`aggregateCalls: ${error.message}`);
    const rows = (data ?? []) as {
      org_id: string;
      duration_seconds: number | null;
      created_at: string;
    }[];
    for (const r of rows) {
      let agg = byOrg.get(r.org_id);
      if (!agg) {
        agg = emptyAgg();
        byOrg.set(r.org_id, agg);
      }
      accumulate(agg, r.duration_seconds);
    }
    if (rows.length < PG_MAX_ROWS) break;
    offset += PG_MAX_ROWS;
  }
  return byOrg;
}

/**
 * Soma o custo REAL de LLM por org em [from, to) a partir de llm_usage_events.
 * É a fonte do COGS (admin only). Pagina como aggregateCalls. Ignora eventos
 * sem org (org_id null = não atribuível, ex.: tradução i18n). orgIds vazio →
 * todas as orgs.
 */
async function aggregateLlmCost(
  supabase: AdminSupabase,
  from: string,
  to: string | null,
  orgIds: string[] | null,
): Promise<Map<string, number>> {
  const byOrg = new Map<string, number>();
  let offset = 0;
  for (;;) {
    let q = supabase
      .from("llm_usage_events")
      .select("org_id, cost_usd, created_at")
      .gte("created_at", from)
      .not("org_id", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + PG_MAX_ROWS - 1);
    if (to) q = q.lt("created_at", to);
    if (orgIds && orgIds.length > 0) q = q.in("org_id", orgIds);

    const { data, error } = await q;
    if (error) throw new Error(`aggregateLlmCost: ${error.message}`);
    const rows = (data ?? []) as {
      org_id: string;
      cost_usd: number | string | null;
      created_at: string;
    }[];
    for (const r of rows) {
      // NUMERIC vem como string do PostgREST — coage pra number.
      const cost = Number(r.cost_usd ?? 0);
      byOrg.set(r.org_id, (byOrg.get(r.org_id) ?? 0) + cost);
    }
    if (rows.length < PG_MAX_ROWS) break;
    offset += PG_MAX_ROWS;
  }
  return byOrg;
}

// ── Orgs (rate + status + nome + plano) ──────────────────────────────────────

interface OrgBillingMeta {
  id: string;
  name: string;
  ratePerMinute: number; // USD
  billingStatus: BillingStatus;
  planName: string;
}

async function fetchOrgMeta(
  supabase: AdminSupabase,
  orgId: string | null,
): Promise<OrgBillingMeta[]> {
  let q = supabase
    .from("organizations")
    .select("id, name, rate_per_minute_micros, billing_status, plans(name)")
    .not("plan_id", "is", null);
  if (orgId) q = q.eq("id", orgId);

  const { data, error } = await q;
  if (error) throw new Error(`fetchOrgMeta: ${error.message}`);

  return ((data ?? []) as unknown as {
    id: string;
    name: string;
    rate_per_minute_micros: number | null;
    billing_status: BillingStatus | null;
    plans: { name: string } | null;
  }[]).map((o) => ({
    id: o.id,
    name: o.name,
    // micro-USD → USD (default 66700 = $0,0667/min).
    ratePerMinute: (o.rate_per_minute_micros ?? DEFAULT_RATE_MICROS) / 1_000_000,
    billingStatus: o.billing_status ?? "PILOT",
    planName: o.plans?.name ?? "—",
  }));
}

/** Org é faturável (entra em totais de receita)? PAID e DEMO contam. */
function isPaying(status: BillingStatus): boolean {
  return status === "PAID" || status === "DEMO";
}

// ── Bloco 1: Usage in period (rolling) ───────────────────────────────────────

/**
 * Admin: usage agregado de TODAS as orgs no range + bar list por org pagante.
 */
export async function dbGetAdminUsage(
  range: BillingPeriodRange,
): Promise<BillingUsage> {
  const supabase = createAdminClient();
  const from = rollingStartIso(range);
  const [aggByOrg, costByOrg, orgs] = await Promise.all([
    aggregateCalls(supabase, from, null, null),
    aggregateLlmCost(supabase, from, null, null),
    fetchOrgMeta(supabase, null),
  ]);

  let callsAnalyzed = 0;
  let billableMinutes = 0;
  let estimatedValue = 0;
  const valueByOrg: BillingValueByOrg[] = [];

  for (const org of orgs) {
    const agg = aggByOrg.get(org.id);
    if (!agg) continue;
    callsAnalyzed += agg.calls;
    billableMinutes += agg.minutes;
    const value = agg.minutes * org.ratePerMinute;
    if (isPaying(org.billingStatus) && value > 0) {
      estimatedValue += value;
      valueByOrg.push({ orgId: org.id, name: org.name, value });
    }
  }

  valueByOrg.sort((a, b) => b.value - a.value);
  const totalOrgs = orgs.length;
  const activePayingOrgs = orgs.filter((o) => isPaying(o.billingStatus)).length;

  // COGS real do período = soma do custo de LLM de todas as orgs (admin only).
  let cogs = 0;
  for (const c of costByOrg.values()) cogs += c;

  return {
    callsAnalyzed,
    billableMinutes,
    estimatedValue: Number(estimatedValue.toFixed(2)),
    activePayingOrgs,
    totalOrgs,
    valueByOrg,
    cogs: Number(cogs.toFixed(2)),
  };
}

/**
 * Owner: usage da própria org no range + sparkline calls/dia (14 dias).
 */
export async function dbGetOwnerUsage(
  orgId: string,
  range: BillingPeriodRange,
): Promise<BillingUsage> {
  const supabase = createAdminClient();
  const from = rollingStartIso(range);
  const [aggByOrg, orgs] = await Promise.all([
    aggregateCalls(supabase, from, null, [orgId]),
    fetchOrgMeta(supabase, orgId),
  ]);

  const agg = aggByOrg.get(orgId) ?? emptyAgg();
  const rate = orgs[0]?.ratePerMinute ?? DEFAULT_RATE_USD;

  return {
    callsAnalyzed: agg.calls,
    billableMinutes: agg.minutes,
    estimatedValue: Number((agg.minutes * rate).toFixed(2)),
    avgCallLengthMin: avgCallLengthMin(agg),
    callsPerDay: await dbGetCallsPerDay(supabase, orgId, 14),
  };
}

/** Contagem de calls por dia nos últimos N dias (sparkline). */
async function dbGetCallsPerDay(
  supabase: AdminSupabase,
  orgId: string,
  days: number,
): Promise<number[]> {
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  from.setUTCHours(0, 0, 0, 0);
  const buckets = new Array(days).fill(0);
  const fromIso = from.toISOString();

  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("calls")
      .select("created_at")
      .eq("org_id", orgId)
      .gte("created_at", fromIso)
      .order("created_at", { ascending: false })
      .range(offset, offset + PG_MAX_ROWS - 1);
    if (error) throw new Error(`dbGetCallsPerDay: ${error.message}`);
    const rows = (data ?? []) as { created_at: string }[];
    for (const r of rows) {
      const dayIdx = Math.floor(
        (new Date(r.created_at).getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (dayIdx >= 0 && dayIdx < days) buckets[dayIdx] += 1;
    }
    if (rows.length < PG_MAX_ROWS) break;
    offset += PG_MAX_ROWS;
  }
  return buckets;
}

// ── Bloco 2: Billing cycle (calendar month) ──────────────────────────────────

/**
 * Admin: tabela de todas as orgs no mês + totais + COGS derivado.
 */
export async function dbGetAdminCycle(month: string): Promise<BillingCycle> {
  const supabase = createAdminClient();
  const { start, end } = monthBoundsIso(month);
  const [aggByOrg, costByOrg, orgs] = await Promise.all([
    aggregateCalls(supabase, start, end, null),
    aggregateLlmCost(supabase, start, end, null),
    fetchOrgMeta(supabase, null),
  ]);

  const rows: BillingOrgRow[] = orgs.map((org) => {
    const agg = aggByOrg.get(org.id);
    const paying = isPaying(org.billingStatus);
    const minutes = agg && paying ? agg.minutes : 0;
    const calls = agg && paying ? agg.calls : 0;
    const amount = Number((minutes * org.ratePerMinute).toFixed(2));
    return {
      orgId: org.id,
      name: org.name,
      status: org.billingStatus,
      planName: org.planName,
      // PILOT/DISABLED: sem cobrança → rate/min = null (UI "—").
      ratePerMinute: paying ? org.ratePerMinute : null,
      billableMinutes: paying ? minutes : null,
      callsBilled: calls,
      amount,
      // Custo REAL de LLM da org no mês (não fração do faturado). Mostrado p/
      // TODAS as orgs incl. PILOT — o custo existe independente de cobrança.
      llmCost: Number((costByOrg.get(org.id) ?? 0).toFixed(2)),
    };
  });

  rows.sort((a, b) => b.amount - a.amount);

  const amountDue = rows.reduce((s, r) => s + r.amount, 0);
  const billableMinutes = rows.reduce((s, r) => s + (r.billableMinutes ?? 0), 0);
  const callsBilled = rows.reduce((s, r) => s + r.callsBilled, 0);
  // COGS = soma do custo real de LLM de todas as orgs no mês (bate com a tabela).
  const cogs = Number(rows.reduce((s, r) => s + r.llmCost, 0).toFixed(2));

  return {
    month,
    monthLabel: monthLabel(month),
    amountDue: Number(amountDue.toFixed(2)),
    billableMinutes,
    callsBilled,
    avgCallLengthMin: 0,
    ratePerMinute: 0,
    planName: "—",
    cogs,
    rows,
  };
}

/**
 * Owner: cycle do mês + histórico dos últimos meses. SEM cogs/rows/llmCost.
 */
export async function dbGetOwnerCycle(
  orgId: string,
  month: string,
  historyMonths = 4,
): Promise<BillingCycle> {
  const supabase = createAdminClient();
  const orgs = await fetchOrgMeta(supabase, orgId);
  const meta = orgs[0];
  const rate = meta?.ratePerMinute ?? DEFAULT_RATE_USD;

  // Mês corrente + (historyMonths - 1) anteriores.
  const months: string[] = [];
  const [y, m] = month.split("-").map(Number);
  for (let i = 0; i < historyMonths; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const aggByMonth = await Promise.all(
    months.map(async (mo) => {
      const { start, end } = monthBoundsIso(mo);
      const byOrg = await aggregateCalls(supabase, start, end, [orgId]);
      return { month: mo, agg: byOrg.get(orgId) ?? emptyAgg() };
    }),
  );

  const nowMonth = months[0];
  const history = aggByMonth.map(({ month: mo, agg }) => ({
    period: monthLabel(mo),
    inProgress: mo === nowMonth,
    calls: agg.calls,
    minutes: agg.minutes,
    amount: Number((agg.minutes * rate).toFixed(2)),
  }));

  const current = aggByMonth[0].agg;

  return {
    month,
    monthLabel: monthLabel(month),
    amountDue: Number((current.minutes * rate).toFixed(2)),
    billableMinutes: current.minutes,
    callsBilled: current.calls,
    avgCallLengthMin: avgCallLengthMin(current),
    ratePerMinute: rate,
    planName: meta?.planName ?? "—",
    history,
    howYouAreBilled: BILLING_HOW_YOU_ARE_BILLED,
  };
}
