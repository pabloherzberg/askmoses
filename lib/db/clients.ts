import { createAdminClient } from "@/lib/supabase/admin";
import { secondsToCostValue } from "@/lib/billing";
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
  totalSecondsThisMonth: number,
  trainersCount: number,
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
    // Segundos agregados dinamicamente das calls do mês (calls.duration_seconds),
    // não de coluna materializada. Custo exato derivado em TS.
    totalSecondsThisMonth,
    totalCostThisMonth: secondsToCostValue(totalSecondsThisMonth),
    health: row.health,
    // Contagem dinâmica de trainers aceitos (memberships), não a coluna
    // materializada organizations.trainers_count.
    trainersCount,
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
  org_total_seconds_this_month: number | string;
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
    totalSecondsThisMonth: Number(row.org_total_seconds_this_month ?? 0),
    totalCostThisMonth: secondsToCostValue(Number(row.org_total_seconds_this_month ?? 0)),
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
 * Listagem paginada + filtrada de organizations para o painel /admin.
 * Usa queries diretas nas tabelas (organizations + plans + memberships +
 * org_scripts + calls) porque a RPC list_admin_organizations pode não existir
 * no schema cache do banco. Interface pública inalterada.
 *
 * Billing por minuto: `totalSecondsThisMonth` é agregado de
 * calls.duration_seconds do mês corrente (UTC); "Sales People" conta
 * memberships trainer aceitas. Como minutos/script-status/version não são
 * colunas filtráveis, esses filtros + a paginação rodam em JS sobre o conjunto
 * já filtrado por coluna — OK na escala atual (dezenas de orgs); se crescer
 * muito, mover a agregação pra SQL.
 */
export async function dbListClients(query: ClientsQuery): Promise<ClientsPage> {
  const supabase = createAdminClient();

  // ── Query base: organizations com plano associado (queries diretas, sem a
  //    RPC list_admin_organizations — ver nota no JSDoc). ───────────────────
  let q = supabase
    .from("organizations")
    .select(
      `id, name, plan_id, calls_this_month, avg_score, health,
       subscription_status, created_at,
       plans(id, code, name, price_cents, timeline_weeks, has_rag,
             has_twilio, has_manual_upload, max_sales_people, features)`,
    )
    .not("plan_id", "is", null); // exclui orgs sem plano (onboarding incompleto)

  // Filtros de COLUNA (no SQL). planCode, scriptStatus/version e minutos são
  // derivados → aplicados em JS depois de enriquecer (ver abaixo).
  if (query.search) q = q.ilike("name", `%${query.search}%`);
  if (query.planStatus) q = q.eq("subscription_status", query.planStatus);
  if (query.lastActivityFrom) q = q.gte("created_at", query.lastActivityFrom);
  if (query.lastActivityTo) q = q.lte("created_at", query.lastActivityTo);

  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error(`dbListClients: ${error.message}`);

  // as unknown as: o supabase-js infere a relação aninhada `plans` como array,
  // mas é to-one (retorna objeto único em runtime — bate com DbOrgRow.plans).
  let orgRows = (data ?? []) as unknown as DbOrgRow[];
  // planCode em JS (evita join complexo no PostgREST) + ignora org sem plano.
  if (query.planCode) orgRows = orgRows.filter((r) => r.plans?.code === query.planCode);
  orgRows = orgRows.filter((r) => r.plans !== null);

  const orgIds = orgRows.map((r) => r.id);

  // ── Enriquecimentos em batch (owner / trainers / script / calls) ─────────
  let ownerAcceptedSet = new Set<string>();
  const trainerCountByOrg = new Map<string, number>();
  const scriptByOrg = new Map<string, OrgScriptInfo>();
  const lastCallByOrg = new Map<string, string>();
  const monthSecondsByOrg = new Map<string, number>();

  if (orgIds.length > 0) {
    const monthStart = monthStartIso();
    const [memRes, trainerRes, scriptRes, callRes] = await Promise.all([
      supabase
        .from("memberships")
        .select("org_id")
        .in("org_id", orgIds)
        .eq("role", "owner")
        .eq("invite_status", "accepted"),
      // Sales people = trainers aceitos (dinâmico, não organizations.trainers_count).
      supabase
        .from("memberships")
        .select("org_id")
        .in("org_id", orgIds)
        .eq("role", "trainer")
        .eq("invite_status", "accepted"),
      supabase
        .from("org_scripts")
        .select(
          `org_id, script_id, status, started_at,
           scripts!script_id(name, rubric_version_snapshot, minor_version)`,
        )
        .in("org_id", orgIds)
        .in("status", ["active", "deprecated", "pending"])
        .is("ended_at", null)
        .order("started_at", { ascending: false }),
      // Uma só leitura de calls alimenta lastCall (all-time) + minutos do mês.
      supabase
        .from("calls")
        .select("org_id, created_at, duration_seconds")
        .in("org_id", orgIds)
        .order("created_at", { ascending: false }),
    ]);

    ownerAcceptedSet = new Set(
      (memRes.data ?? []).map((m: { org_id: string }) => m.org_id),
    );

    for (const m of (trainerRes.data ?? []) as { org_id: string }[]) {
      trainerCountByOrg.set(m.org_id, (trainerCountByOrg.get(m.org_id) ?? 0) + 1);
    }

    type ScriptRow = {
      org_id: string;
      script_id: string;
      status: OrgScriptStatus;
      started_at: string | null;
      scripts: { name: string; rubric_version_snapshot: number; minor_version: number } | null;
    };
    const seenScript = new Set<string>();
    for (const row of (scriptRes.data ?? []) as unknown as ScriptRow[]) {
      if (seenScript.has(row.org_id)) continue;
      seenScript.add(row.org_id);
      const s = row.scripts;
      if (!s) continue;
      scriptByOrg.set(row.org_id, {
        scriptId: row.script_id,
        scriptName: s.name,
        version: `${s.rubric_version_snapshot ?? 1}.${s.minor_version ?? 0}`,
        previousVersion: null,
        status: row.status,
        startedAt: row.started_at,
      });
    }

    // created_at desc → 1ª ocorrência por org = última call. Soma
    // duration_seconds do mês corrente (compare lexicográfico de ISO/UTC).
    const seenCall = new Set<string>();
    for (const row of (callRes.data ?? []) as {
      org_id: string;
      created_at: string;
      duration_seconds: number | null;
    }[]) {
      if (!seenCall.has(row.org_id)) {
        seenCall.add(row.org_id);
        lastCallByOrg.set(row.org_id, row.created_at);
      }
      if (row.created_at >= monthStart) {
        monthSecondsByOrg.set(
          row.org_id,
          (monthSecondsByOrg.get(row.org_id) ?? 0) + (row.duration_seconds ?? 0),
        );
      }
    }
  }

  let clients = orgRows.map((r) =>
    toClient(
      r,
      ownerAcceptedSet.has(r.id),
      scriptByOrg.get(r.id) ?? null,
      lastCallByOrg.get(r.id) ?? null,
      monthSecondsByOrg.get(r.id) ?? 0,
      trainerCountByOrg.get(r.id) ?? 0,
    ),
  );

  // ── Filtros derivados (JS): script status/version + minutos ──────────────
  if (query.scriptStatus) {
    clients = clients.filter(
      (c) => (c.currentScript?.status ?? "none") === query.scriptStatus,
    );
  }
  if (query.scriptVersion) {
    clients = clients.filter((c) => c.currentScript?.version === query.scriptVersion);
  }
  if (query.minutesMin !== undefined) {
    clients = clients.filter((c) => c.totalSecondsThisMonth >= query.minutesMin! * 60);
  }
  if (query.minutesMax !== undefined) {
    clients = clients.filter((c) => c.totalSecondsThisMonth <= query.minutesMax! * 60);
  }

  // ── Total + paginação (em JS — escala pequena nesta fase) ────────────────
  const total = clients.length;
  const fromIdx = (query.page - 1) * query.limit;
  clients = clients.slice(fromIdx, fromIdx + query.limit);

  // ── Enriquecimento 1: nome do pending coexistindo com active (modelo 057) ──
  // Pra cada org com active/deprecated corrente, busca se há também um
  // pending aberto e qual o nome do script — alimenta o Info icon do row
  // do admin. Embed via scripts!script_id desambigua a FK (org_scripts tem
  // 2 refs pra scripts: script_id e previous_script_id).
  const clientOrgIds = clients.map((c) => c.id);
  if (clientOrgIds.length > 0) {
    const { data: pendings, error: pendingErr } = await supabase
      .from("org_scripts")
      .select("org_id, scripts!script_id(name)")
      .in("org_id", clientOrgIds)
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

// ── Segundos consumidos no mês (cobrança por minuto) ────────────────────
// Agregado dinâmico de calls.duration_seconds — NÃO há coluna materializada
// (evita dessincronização e reset mensal manual). Retorna SEGUNDOS crus; a
// conversão pra minutos/custo é feita pelo consumidor (sem arredondar minuto,
// pra não divergir do que o /admin mostra via RPC). O recorte do mês usa UTC
// pra casar com a RPC (date_trunc('month', now() AT TIME ZONE 'UTC')).

type AdminSupabase = ReturnType<typeof createAdminClient>;

/** Início do mês corrente em ISO/UTC — alinhado com o boundary da RPC. */
function monthStartIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

/** Segundos consumidos por uma org no mês corrente (soma de duration_seconds). */
async function dbGetOrgMonthSeconds(
  supabase: AdminSupabase,
  orgId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("calls")
    .select("duration_seconds")
    .eq("org_id", orgId)
    .gte("created_at", monthStartIso());
  if (error) throw new Error(`dbGetOrgMonthSeconds: ${error.message}`);
  return (data ?? []).reduce(
    (s, r: { duration_seconds: number | null }) => s + (r.duration_seconds ?? 0),
    0,
  );
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

  const [orgRes, ownerRes, trainersRes] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id, name, plan_id, calls_this_month, avg_score, health, subscription_status, created_at, plans(*)",
      )
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("role", "owner")
      .eq("invite_status", "accepted"),
    // Sales people = trainers aceitos (dinâmico, não organizations.trainers_count).
    supabase
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("role", "trainer")
      .eq("invite_status", "accepted"),
  ]);

  if (orgRes.error) {
    if (orgRes.error.code === "PGRST116") return null;
    throw new Error(`dbGetClientByOrgId: ${orgRes.error.message}`);
  }

  if (!orgRes.data) return null;
  if (!(orgRes.data as { plan_id: string | null }).plan_id) return null;

  const ownerAccepted = (ownerRes.count ?? 0) > 0;
  const trainersCount = trainersRes.count ?? 0;

  // currentScript + lastCallAt + segundos do mês: queries dedicadas pra esse
  // único org (sem reuse da RPC que é otimizada pra batch).
  const [scriptRes, lastCallRes, monthSeconds] = await Promise.all([
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
    dbGetOrgMonthSeconds(supabase, orgId),
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
    monthSeconds,
    trainersCount,
  );
}

// ── Métricas globais (não paginadas — agregação direta) ──────────────────

/**
 * Métricas globais (total clients, total calls, avg score) agregadas pelas
 * organizations com plano ativo. Orgs sem plano ficam de fora pra não
 * contaminar o avg_score com zeros do estado de onboarding.
 *
 * Não inclui minutos/custo: os cards do /admin não exibem agregado global de
 * consumo — minutos/custo são por-org (ver list_admin_organizations). Quando
 * houver um card global de receita, agregar aqui via SQL SUM.
 */
export async function dbGetGlobalMetrics(): Promise<GlobalMetrics> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("calls_this_month, avg_score")
    .not("plan_id", "is", null);

  if (error) throw new Error(`dbGetGlobalMetrics: ${error.message}`);

  const rows = (data ?? []) as Array<{
    calls_this_month: number;
    avg_score: number;
  }>;

  return {
    totalClients: rows.length,
    totalCallsThisMonth: rows.reduce(
      (s, r) => s + (r.calls_this_month ?? 0),
      0,
    ),
    avgScore: rows.length
      ? Math.round(
          rows.reduce((s, r) => s + (r.avg_score ?? 0), 0) / rows.length,
        )
      : 0,
  };
}
