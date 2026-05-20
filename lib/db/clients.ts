import { createAdminClient } from "@/lib/supabase/admin";
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
  mrr: number | null;
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
    mrr: Number(row.mrr ?? 0),
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
  mrrMin?: number;
  mrrMax?: number;
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
  org_mrr: number | string;
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
      row.script_status === "pending" &&
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
    mrr: Number(row.org_mrr ?? 0),
    health: row.org_health,
    trainersCount: row.org_trainers_count,
    ownerAccepted: row.owner_accepted,
    subscriptionStatus: row.org_subscription_status,
    currentScript,
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
    p_mrr_min: query.mrrMin ?? null,
    p_mrr_max: query.mrrMax ?? null,
    p_last_activity_from: query.lastActivityFrom ?? null,
    p_last_activity_to: query.lastActivityTo ?? null,
    p_page: query.page,
    p_limit: query.limit,
  });

  if (error) throw new Error(`dbListClients: ${error.message}`);

  const rows = (data ?? []) as RpcRow[];
  const total = rows.length > 0 ? Number(rows[0].total) : 0;

  return {
    rows: rows.map(rpcRowToClient),
    total,
    page: query.page,
    limit: query.limit,
  };
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
        "id, name, plan_id, calls_this_month, avg_score, mrr, health, trainers_count, subscription_status, created_at, plans(*)",
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

  // currentScript + lastCallAt: queries dedicadas pra esse único org
  // (sem reuse da RPC que é otimizada pra batch).
  const [scriptRes, lastCallRes] = await Promise.all([
    supabase
      .from("org_scripts_current")
      .select(
        "script_id, script_name, rubric_version_snapshot, minor_version, effective_status, started_at, ended_at",
      )
      .eq("org_id", orgId)
      .is("ended_at", null)
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
  );
}

// ── Métricas globais (não paginadas — agregação direta) ──────────────────

/**
 * Métricas globais (MRR, total calls, avg score) agregadas pelas
 * organizations com plano ativo. Orgs sem plano ficam de fora pra não
 * contaminar o avg_score / MRR com zeros do estado de onboarding.
 *
 * Continua agregando em JS — pra ~milhares de orgs ainda é OK, mas se
 * passar de 10k vale migrar pra um SQL aggregation.
 */
export async function dbGetGlobalMetrics(): Promise<GlobalMetrics> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("mrr, calls_this_month, avg_score")
    .not("plan_id", "is", null);

  if (error) throw new Error(`dbGetGlobalMetrics: ${error.message}`);

  const rows = (data ?? []) as Array<{
    mrr: number;
    calls_this_month: number;
    avg_score: number;
  }>;
  return {
    totalClients: rows.length,
    totalCallsThisMonth: rows.reduce(
      (s, r) => s + (r.calls_this_month ?? 0),
      0,
    ),
    totalMRR: rows.reduce((s, r) => s + Number(r.mrr ?? 0), 0),
    avgScore: rows.length
      ? Math.round(
          rows.reduce((s, r) => s + (r.avg_score ?? 0), 0) / rows.length,
        )
      : 0,
  };
}
