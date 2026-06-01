import { createAdminClient } from "@/lib/supabase/admin";
import { minutesToCostValue } from "@/lib/utils";
import type {
  Client,
  GlobalMetrics,
  HealthStatus,
  OrgScriptInfo,
  OrgScriptStatus,
  Plan,
  PlanCode,
} from "@/lib/types";

// Após migration 038 a tabela `clients` foi mesclada em `organizations`.
// O tipo TS `Client` continua existindo como shape lida pelas telas Admin
// — só a fonte de dados mudou.
//
// Conceitualmente: 1 organization == 1 client. O `orgId` no shape é
// redundante com o `id`, mas mantido pra preservar a API pública.

interface DbPlanNested {
  id: string;
  code: PlanCode;
  name: string;
  price_cents: number;
  timeline_weeks: number;
  has_rag: boolean;
  has_twilio: boolean;
  has_manual_upload: boolean;
  max_sales_people: number | null;
  features: string[] | null;
}

interface DbOrgRow {
  id: string;
  name: string;
  plan_id: string | null;
  calls_this_month: number | null;
  avg_score: number | null;
  health: HealthStatus;
  trainers_count: number | null;
  subscription_status: "active" | "inactive" | "trial";
  created_at: string | null;
  plans: DbPlanNested | null;
}

function toPlan(row: DbPlanNested): Plan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    priceCents: row.price_cents,
    timelineWeeks: row.timeline_weeks,
    hasRag: row.has_rag,
    hasTwilio: row.has_twilio,
    hasManualUpload: row.has_manual_upload,
    maxSalesPeople: row.max_sales_people,
    features: row.features ?? [],
  };
}

function toClient(
  row: DbOrgRow,
  ownerAccepted: boolean,
  currentScript: OrgScriptInfo | null,
  lastCallAt: string | null,
  totalMinutesThisMonth: number,
): Client {
  if (!row.plans) {
    throw new Error(
      `Organization ${row.id} has no plan (plan_id=${row.plan_id ?? "null"})`,
    );
  }
  return {
    id: row.id,
    name: row.name,
    planId: row.plan_id ?? "",
    plan: toPlan(row.plans),
    orgId: row.id,
    callsThisMonth: row.calls_this_month ?? 0,
    avgScore: row.avg_score ?? 0,
    // Minutos vêm agregados dinamicamente das calls do mês (calls.duration_seconds),
    // não de coluna materializada. Custo derivado em TS (centraliza a tarifa).
    totalMinutesThisMonth,
    totalCostThisMonth: minutesToCostValue(totalMinutesThisMonth),
    health: row.health,
    trainersCount: row.trainers_count ?? 0,
    ownerAccepted,
    subscriptionStatus: row.subscription_status,
    currentScript,
    lastCallAt,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

// ── Listagem paginada via RPC ────────────────────────────────────────────

export interface ClientsQuery {
  search?: string;
  planCode?: PlanCode;
  planStatus?: "active" | "inactive" | "trial";
  scriptStatus?: OrgScriptStatus; // inclui 'none'
  scriptVersion?: string; // "1.2"
  minutesMin?: number;
  minutesMax?: number;
  lastActivityFrom?: string; // ISO
  lastActivityTo?: string;
  page: number;
  limit: number;
}

export interface ClientsPage {
  rows: Client[];
  total: number;
  page: number;
  limit: number;
}

// Row achatada vinda da RPC list_admin_organizations.
interface RpcRow {
  org_id: string;
  org_name: string;
  org_created_at: string;
  org_subscription_status: "active" | "inactive" | "trial";
  org_total_minutes_this_month: number | string;
  org_health: HealthStatus;
  org_trainers_count: number;
  org_calls_this_month: number;
  org_avg_score: number;
  plan_id: string;
  plan_code: PlanCode;
  plan_name: string;
  plan_price_cents: number;
  plan_timeline_weeks: number;
  plan_has_rag: boolean;
  plan_has_twilio: boolean;
  plan_has_manual_upload: boolean;
  plan_max_sales_people: number | null;
  plan_features: unknown;
  owner_accepted: boolean;
  script_id: string | null;
  script_name: string | null;
  script_major_version: number | null;
  script_minor_version: number | null;
  script_status: OrgScriptStatus;
  script_started_at: string | null;
  prev_script_major: number | null;
  prev_script_minor: number | null;
  last_call_at: string | null;
  total: number | string;
}

function rpcRowToClient(row: RpcRow): Client {
  // plans.features vem como JSONB array. Defensive: aceita array de strings,
  // ignora outros formatos pra não quebrar a UI.
  const featuresRaw = row.plan_features;
  const features = Array.isArray(featuresRaw)
    ? featuresRaw.filter((f): f is string => typeof f === "string")
    : [];

  const plan: Plan = {
    id: row.plan_id,
    code: row.plan_code,
    name: row.plan_name,
    priceCents: row.plan_price_cents,
    timelineWeeks: row.plan_timeline_weeks,
    hasRag: row.plan_has_rag,
    hasTwilio: row.plan_has_twilio,
    hasManualUpload: row.plan_has_manual_upload,
    maxSalesPeople: row.plan_max_sales_people,
    features,
  };

  let currentScript: OrgScriptInfo | null = null;
  if (row.script_id && row.script_status !== "none") {
    const previousVersion =
      (row.script_status === "pending" || row.script_status === "rejected") &&
      row.prev_script_major !== null &&
      row.prev_script_minor !== null
        ? `${row.prev_script_major}.${row.prev_script_minor}`
        : null;
    currentScript = {
      scriptId: row.script_id,
      scriptName: row.script_name ?? "",
      version: `${row.script_major_version ?? 1}.${row.script_minor_version ?? 0}`,
      previousVersion,
      status: row.script_status,
      startedAt: row.script_started_at,
    };
  }

  return {
    id: row.org_id,
    name: row.org_name,
    planId: row.plan_id,
    plan,
    orgId: row.org_id,
    callsThisMonth: row.org_calls_this_month,
    avgScore: row.org_avg_score,
    totalMinutesThisMonth: Number(row.org_total_minutes_this_month ?? 0),
    totalCostThisMonth: minutesToCostValue(Number(row.org_total_minutes_this_month ?? 0)),
    health: row.org_health,
    trainersCount: row.org_trainers_count,
    ownerAccepted: row.owner_accepted,
    subscriptionStatus: row.org_subscription_status,
    currentScript,
    // pendingScriptName é preenchido por dbListClients via query separada.
    // No single-org fetch (dbGetClientByOrgId) inicializamos null — caller
    // pode buscar via dbGetActiveOrgScript ou query própria se precisar.
    pendingScriptName: null,
    lastCallAt: row.last_call_at,
    createdAt: row.org_created_at,
  };
}

/**
 * Listagem paginada + filtrada via RPC list_admin_organizations
 * (migration 048). Substitui o dbGetClients() antigo que carregava tudo.
 *
 * Filtros opcionais — qualquer combinação. Pagination obrigatória
 * (default page=1, limit=25 no SQL, mas caller deve passar explicitamente).
 *
 * Retorna { rows, total, page, limit }. total é o count pré-paginação
 * (mesmo valor em todas as linhas da RPC; só pegamos da primeira).
 */
export async function dbListClients(query: ClientsQuery): Promise<ClientsPage> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("list_admin_organizations", {
    p_search: query.search ?? null,
    p_plan_code: query.planCode ?? null,
    p_plan_status: query.planStatus ?? null,
    p_script_status: query.scriptStatus ?? null,
    p_script_version: query.scriptVersion ?? null,
    p_minutes_min: query.minutesMin ?? null,
    p_minutes_max: query.minutesMax ?? null,
    p_last_activity_from: query.lastActivityFrom ?? null,
    p_last_activity_to: query.lastActivityTo ?? null,
    p_page: query.page,
    p_limit: query.limit,
  });

  if (error) throw new Error(`dbListClients: ${error.message}`);

  const rows = (data ?? []) as RpcRow[];
  const total = rows.length > 0 ? Number(rows[0].total) : 0;

  const clients = rows.map(rpcRowToClient);

  // ── Enriquecimento 1: nome do pending coexistindo com active (modelo 057) ──
  // Pra cada org com active/deprecated corrente, busca se há também um
  // pending aberto e qual o nome do script — alimenta o Info icon do row
  // do admin. Embed via scripts!script_id desambigua a FK (org_scripts tem
  // 2 refs pra scripts: script_id e previous_script_id).
  const orgIds = clients.map((c) => c.id);
  if (orgIds.length > 0) {
    const { data: pendings, error: pendingErr } = await supabase
      .from("org_scripts")
      .select("org_id, scripts!script_id(name)")
      .in("org_id", orgIds)
      .eq("status", "pending")
      .is("ended_at", null);
    if (pendingErr) {
      console.error("[dbListClients] falha ao buscar pendings:", pendingErr);
    } else if (pendings) {
      type PendingRow = {
        org_id: string;
        scripts: { name: string } | { name: string }[] | null;
      };
      const pendingByOrg = new Map<string, string>();
      for (const p of pendings as unknown as PendingRow[]) {
        const scriptObj = Array.isArray(p.scripts) ? p.scripts[0] : p.scripts;
        if (scriptObj?.name) pendingByOrg.set(p.org_id, scriptObj.name);
      }
      for (const c of clients) {
        c.pendingScriptName = pendingByOrg.get(c.id) ?? null;
      }
    }
  }

  // ── Enriquecimento 2: analysis_status do pending (Script Intelligence) ────
  // Busca o org_script_id e o analysis_status do cache para mostrar
  // "Analisando..." / "Na fila" na tabela do admin enquanto a IA ainda
  // está rodando o pending.
  const pendingOrgIds = clients
    .filter((c) => c.currentScript?.status === 'pending')
    .map((c) => c.id);

  if (pendingOrgIds.length > 0) {
    const { data: orgScriptRows } = await supabase
      .from('org_scripts')
      .select('id, org_id')
      .in('org_id', pendingOrgIds)
      .eq('status', 'pending')
      .is('ended_at', null)

    if (orgScriptRows && orgScriptRows.length > 0) {
      const orgScriptByOrg = Object.fromEntries(
        (orgScriptRows as Array<{ id: string; org_id: string }>).map((r) => [r.org_id, r.id])
      )
      const orgScriptIds = (orgScriptRows as Array<{ id: string }>).map((r) => r.id)

      const { data: cacheRows } = await supabase
        .from('script_intelligence_cache')
        .select('org_script_id, analysis_status')
        .in('org_script_id', orgScriptIds)

      const cacheByOrgScript = Object.fromEntries(
        (cacheRows ?? []).map((r: { org_script_id: string; analysis_status: string }) => [
          r.org_script_id,
          r.analysis_status,
        ])
      )

      for (const client of clients) {
        if (client.currentScript?.status !== 'pending') continue
        const orgScriptId = orgScriptByOrg[client.id] ?? null
        if (!orgScriptId) continue
        const status = cacheByOrgScript[orgScriptId] ?? null
        client.currentScript.orgScriptId = orgScriptId
        client.currentScript.analysisStatus =
          status === 'processing' ? 'processing'
          : status === 'queued' ? 'queued'
          : null
      }
    }
  }

  return {
    rows: clients,
    total,
    page: query.page,
    limit: query.limit,
  };
}

// ── Minutos consumidos no mês (cobrança por minuto) ─────────────────────
// Agregado dinâmico de calls.duration_seconds — NÃO há coluna materializada
// (evita dessincronização e o reset mensal manual). Mesma semântica do
// CEIL(SUM(duration_seconds)/60) usado na RPC list_admin_organizations
// (migration 071): minuto iniciado conta como minuto cheio.

type AdminSupabase = ReturnType<typeof createAdminClient>;

/** Primeiro instante do mês corrente em ISO/UTC — equivale a date_trunc('month', now()). */
function monthStartIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

/** Minutos consumidos por uma org no mês corrente (soma de duration_seconds). */
async function dbGetOrgMonthMinutes(
  supabase: AdminSupabase,
  orgId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("calls")
    .select("duration_seconds")
    .eq("org_id", orgId)
    .gte("created_at", monthStartIso());
  if (error) throw new Error(`dbGetOrgMonthMinutes: ${error.message}`);
  const totalSeconds = (data ?? []).reduce(
    (s, r: { duration_seconds: number | null }) => s + (r.duration_seconds ?? 0),
    0,
  );
  return Math.ceil(totalSeconds / 60);
}

// ── Single-org fetch (mantido sem mudança no shape) ─────────────────────

/**
 * Retorna o client (com plano embutido) vinculado a um org_id.
 * Pós-merge: orgId === clientId. Usa as queries originais (sem paginação)
 * porque é lookup pontual.
 */
export async function dbGetClientByOrgId(
  orgId: string,
): Promise<Client | null> {
  const supabase = createAdminClient();

  const [orgRes, ownerRes] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id, name, plan_id, calls_this_month, avg_score, health, trainers_count, subscription_status, created_at, plans(*)",
      )
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("role", "owner")
      .eq("invite_status", "accepted"),
  ]);

  if (orgRes.error) {
    if (orgRes.error.code === "PGRST116") return null;
    throw new Error(`dbGetClientByOrgId: ${orgRes.error.message}`);
  }

  if (!orgRes.data) return null;
  if (!(orgRes.data as { plan_id: string | null }).plan_id) return null;

  const ownerAccepted = (ownerRes.count ?? 0) > 0;

  // currentScript + lastCallAt + minutos do mês: queries dedicadas pra esse
  // único org (sem reuse da RPC que é otimizada pra batch).
  const [scriptRes, lastCallRes, monthMinutes] = await Promise.all([
    // Filtra explicitamente por effective_status IN ('active','deprecated')
    // — os dois mapeiam pra status='active' no banco. Pending agora coexiste
    // com active (mig. 057): sem este filtro o order-by started_at pegaria a
    // proposta pendente mais recente em vez do script atual da org.
    supabase
      .from("org_scripts_current")
      .select(
        "script_id, script_name, rubric_version_snapshot, minor_version, effective_status, started_at, ended_at",
      )
      .eq("org_id", orgId)
      .is("ended_at", null)
      .in("effective_status", ["active", "deprecated"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("calls")
      .select("created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    dbGetOrgMonthMinutes(supabase, orgId),
  ]);

  let currentScript: OrgScriptInfo | null = null;
  if (scriptRes.data) {
    const s = scriptRes.data as {
      script_id: string;
      script_name: string;
      rubric_version_snapshot: number;
      minor_version: number;
      effective_status: OrgScriptStatus;
      started_at: string | null;
    };
    currentScript = {
      scriptId: s.script_id,
      scriptName: s.script_name,
      version: `${s.rubric_version_snapshot}.${s.minor_version}`,
      previousVersion: null,
      status: s.effective_status,
      startedAt: s.started_at,
    };
  }

  const lastCallAt =
    (lastCallRes.data as { created_at: string } | null)?.created_at ?? null;

  return toClient(
    orgRes.data as unknown as DbOrgRow,
    ownerAccepted,
    currentScript,
    lastCallAt,
    monthMinutes,
  );
}

// ── Métricas globais (não paginadas — agregação direta) ──────────────────

/**
 * Métricas globais (minutos consumidos, custo, total calls, avg score)
 * agregadas pelas organizations com plano ativo. Orgs sem plano ficam de fora
 * pra não contaminar o avg_score / agregados com zeros do estado de onboarding.
 *
 * Custo é derivado dos minutos em TS (minutesToCostValue) — única fonte da
 * tarifa. Continua agregando em JS — pra ~milhares de orgs ainda é OK, mas se
 * passar de 10k vale migrar pra um SQL aggregation.
 */
export async function dbGetGlobalMetrics(): Promise<GlobalMetrics> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("id, calls_this_month, avg_score")
    .not("plan_id", "is", null);

  if (error) throw new Error(`dbGetGlobalMetrics: ${error.message}`);

  const rows = (data ?? []) as Array<{
    id: string;
    calls_this_month: number;
    avg_score: number;
  }>;

  // Minutos: agregado dinâmico das calls do mês das orgs com plano ativo
  // (calls.duration_seconds) — sem coluna materializada. Custo derivado em TS.
  let totalMinutesThisMonth = 0;
  const orgIds = rows.map((r) => r.id);
  if (orgIds.length > 0) {
    const { data: callRows, error: callErr } = await supabase
      .from("calls")
      .select("duration_seconds")
      .in("org_id", orgIds)
      .gte("created_at", monthStartIso());
    if (callErr) throw new Error(`dbGetGlobalMetrics(minutes): ${callErr.message}`);
    const totalSeconds = (callRows ?? []).reduce(
      (s, r: { duration_seconds: number | null }) => s + (r.duration_seconds ?? 0),
      0,
    );
    totalMinutesThisMonth = Math.ceil(totalSeconds / 60);
  }

  return {
    totalClients: rows.length,
    totalCallsThisMonth: rows.reduce(
      (s, r) => s + (r.calls_this_month ?? 0),
      0,
    ),
    totalMinutesThisMonth,
    totalCostThisMonth: minutesToCostValue(totalMinutesThisMonth),
    avgScore: rows.length
      ? Math.round(
          rows.reduce((s, r) => s + (r.avg_score ?? 0), 0) / rows.length,
        )
      : 0,
  };
}
