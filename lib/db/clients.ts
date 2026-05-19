import { createAdminClient } from '@/lib/supabase/admin'
import type {
  Client,
  GlobalMetrics,
  HealthStatus,
  OrgScriptInfo,
  OrgScriptStatus,
  Plan,
  PlanCode,
} from '@/lib/types'

// Após migration 038 a tabela `clients` foi mesclada em `organizations`.
// O tipo TS `Client` continua existindo como shape lida pelas telas Admin
// — só a fonte de dados mudou. As funções abaixo lêem direto de
// organizations + plans e remontam o shape `Client` pra não impactar
// callers (admin pages, métricas globais, etc.).
//
// Conceitualmente: 1 organization == 1 client. O `orgId` no shape é
// redundante com o `id`, mas mantido pra preservar a API pública.

interface DbPlanNested {
  id: string
  code: PlanCode
  name: string
  price_cents: number
  timeline_weeks: number
  has_rag: boolean
  has_twilio: boolean
  has_manual_upload: boolean
  max_sales_people: number | null
  features: string[] | null
}

interface DbOrgRow {
  id: string
  name: string
  plan_id: string | null
  calls_this_month: number | null
  avg_score: number | null
  mrr: number | null
  health: HealthStatus
  trainers_count: number | null
  subscription_status: 'active' | 'inactive' | 'trial'
  created_at: string | null
  plans: DbPlanNested | null
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
  }
}

function toClient(
  row: DbOrgRow,
  ownerAccepted: boolean,
  currentScript: OrgScriptInfo | null,
  lastCallAt: string | null,
): Client {
  if (!row.plans) {
    // Pós-merge: org pode existir sem plano (Owner em onboarding step-2).
    // Antes esse caso não existia (clients sempre tinha plan_id NOT NULL na
    // prática). Quem consome essa função em listagens deve filtrar por
    // plan_id NOT NULL ou tratar org-sem-plano explicitamente. Aqui
    // levantamos pra não silenciosamente retornar shape inconsistente.
    throw new Error(`Organization ${row.id} has no plan (plan_id=${row.plan_id ?? 'null'})`)
  }
  return {
    id: row.id,
    name: row.name,
    planId: row.plan_id ?? '',
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
  }
}

// Row do view org_scripts_current criado na migration 044.
interface DbOrgScriptRow {
  org_id: string
  script_id: string
  script_name: string
  rubric_version_snapshot: number
  minor_version: number
  effective_status: 'pending' | 'active' | 'deprecated' | 'rejected'
  started_at: string | null
  ended_at: string | null
}

/**
 * Busca o script "atual" de cada org. Critério: linha mais recente em
 * org_scripts_current onde ended_at IS NULL (ou seja, ainda associada).
 * Quando o Admin envia um novo script, o anterior recebe ended_at — só o
 * mais recente sem ended_at é a associação corrente.
 *
 * Quando o status atual é 'pending', também resolve a previousVersion (o
 * script anterior aceito, ended_at NOT NULL mais recente) pra UI poder
 * renderizar a transição "v_old → v_new".
 *
 * Retorna Map<orgId, OrgScriptInfo>. Orgs sem script associado ficam
 * fora do map (caller renderiza como status='none').
 *
 * Se a view não existir ainda (migration 044 não aplicada), retorna map
 * vazio em vez de quebrar — permite o app rodar enquanto a migration está
 * pendente em algum ambiente.
 */
async function getCurrentScriptsByOrg(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Map<string, OrgScriptInfo>> {
  // Uma query única ordenada por org_id + started_at desc nos dá tanto a
  // linha atual (primeira por org) quanto a previousVersion (segunda).
  // Ignora ended_at no filtro pra incluir o anterior (que TEM ended_at).
  const { data, error } = await supabase
    .from('org_scripts_current')
    .select('org_id, script_id, script_name, rubric_version_snapshot, minor_version, effective_status, started_at, ended_at')
    .order('org_id', { ascending: true })
    .order('started_at', { ascending: false })

  if (error) {
    // 42P01 = relation does not exist. Permite o painel admin funcionar
    // mesmo se a migration 044 ainda não rodou no ambiente.
    if (error.code === '42P01') {
      console.warn('[clients] org_scripts_current view ausente — script status indisponível')
      return new Map()
    }
    throw new Error(`getCurrentScriptsByOrg: ${error.message}`)
  }

  // Agrupa por org_id; a primeira linha é a atual (ended_at IS NULL ou a
  // mais recente), as seguintes formam o histórico.
  const byOrg = new Map<string, DbOrgScriptRow[]>()
  for (const row of (data ?? []) as DbOrgScriptRow[]) {
    const list = byOrg.get(row.org_id) ?? []
    list.push(row)
    byOrg.set(row.org_id, list)
  }

  const result = new Map<string, OrgScriptInfo>()
  for (const [orgId, rows] of byOrg.entries()) {
    // Procura a linha "current" = primeira sem ended_at. Se todas têm
    // ended_at (caso edge: org teve scripts e todos foram fechados sem
    // novo), pula essa org — não tem script corrente.
    const current = rows.find((r) => r.ended_at === null)
    if (!current) continue

    // previousVersion só faz sentido quando o atual é 'pending'. Buscamos a
    // entrada imediatamente anterior (mais recente com ended_at NOT NULL).
    let previousVersion: string | null = null
    if (current.effective_status === 'pending') {
      const previous = rows.find((r) => r.ended_at !== null)
      if (previous) {
        previousVersion = `${previous.rubric_version_snapshot}.${previous.minor_version}`
      }
    }

    result.set(orgId, {
      scriptId: current.script_id,
      scriptName: current.script_name,
      version: `${current.rubric_version_snapshot}.${current.minor_version}`,
      previousVersion,
      status: current.effective_status as OrgScriptStatus,
      startedAt: current.started_at,
    })
  }
  return result
}

// MAX(calls.created_at) agrupado por org_id. Usado pra coluna "Last Activity"
// na tabela admin. Pode falhar silenciosamente se a tabela calls não tem
// nenhuma linha — retorna map vazio nesse caso.
async function getLastCallByOrg(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('calls')
    .select('org_id, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[clients] não foi possível buscar last_call_at:', error.message)
    return new Map()
  }

  // Como veio ordenado desc, a primeira ocorrência de cada org_id é a mais
  // recente. Skip subsequentes.
  const map = new Map<string, string>()
  for (const row of (data ?? []) as Array<{ org_id: string | null; created_at: string }>) {
    if (!row.org_id || map.has(row.org_id)) continue
    map.set(row.org_id, row.created_at)
  }
  return map
}

/**
 * Lista clientes (organizations) com plano embutido + flag ownerAccepted.
 * Filtra orgs sem plano (sub não-ativada / mid-onboarding).
 *
 * ownerAccepted = existe membership com role='owner' e invite_status='accepted'.
 * Quando false, Admin criou a org+invite mas Owner ainda não clicou no magic
 * link — UI mostra chip "Aguardando Owner" ao lado do nome.
 */
export async function dbGetClients(): Promise<Client[]> {
  const supabase = createAdminClient()

  const [orgsRes, ownersRes, scriptsByOrg, lastCallByOrg] = await Promise.all([
    supabase
      .from('organizations')
      .select(
        'id, name, plan_id, calls_this_month, avg_score, mrr, health, trainers_count, subscription_status, created_at, plans(*)'
      )
      .not('plan_id', 'is', null)
      .order('name', { ascending: true }),
    supabase
      .from('memberships')
      .select('org_id')
      .eq('role', 'owner')
      .eq('invite_status', 'accepted'),
    getCurrentScriptsByOrg(supabase),
    getLastCallByOrg(supabase),
  ])

  if (orgsRes.error) throw new Error(`dbGetClients: ${orgsRes.error.message}`)
  if (ownersRes.error) throw new Error(`dbGetClients (memberships): ${ownersRes.error.message}`)

  // Set de org_ids que têm pelo menos 1 owner aceito. Lookup O(1) no map abaixo.
  const ownerAcceptedSet = new Set(
    (ownersRes.data ?? []).map((m: { org_id: string }) => m.org_id),
  )

  return (orgsRes.data ?? []).map((row) => {
    const orgId = (row as { id: string }).id
    return toClient(
      row as unknown as DbOrgRow,
      ownerAcceptedSet.has(orgId),
      scriptsByOrg.get(orgId) ?? null,
      lastCallByOrg.get(orgId) ?? null,
    )
  })
}

/**
 * Retorna o client (com plano embutido) vinculado a um org_id.
 * Pós-merge: orgId === clientId. Mantém a assinatura antiga.
 */
export async function dbGetClientByOrgId(orgId: string): Promise<Client | null> {
  const supabase = createAdminClient()

  const [orgRes, ownerRes, scriptsByOrg, lastCallByOrg] = await Promise.all([
    supabase
      .from('organizations')
      .select(
        'id, name, plan_id, calls_this_month, avg_score, mrr, health, trainers_count, subscription_status, created_at, plans(*)'
      )
      .eq('id', orgId)
      .maybeSingle(),
    supabase
      .from('memberships')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('role', 'owner')
      .eq('invite_status', 'accepted'),
    getCurrentScriptsByOrg(supabase),
    getLastCallByOrg(supabase),
  ])

  if (orgRes.error) {
    if (orgRes.error.code === 'PGRST116') return null
    throw new Error(`dbGetClientByOrgId: ${orgRes.error.message}`)
  }

  if (!orgRes.data) return null
  // Org sem plano (onboarding mid-flight) não vira Client — caller decide
  // o que fazer (Admin views, métricas etc. tratam como "sem assinatura").
  if (!(orgRes.data as { plan_id: string | null }).plan_id) return null

  const ownerAccepted = (ownerRes.count ?? 0) > 0
  return toClient(
    orgRes.data as unknown as DbOrgRow,
    ownerAccepted,
    scriptsByOrg.get(orgId) ?? null,
    lastCallByOrg.get(orgId) ?? null,
  )
}

/**
 * Métricas globais (MRR, total calls, avg score) agregadas pelas
 * organizations com plano ativo. Orgs sem plano ficam de fora pra não
 * contaminar o avg_score / MRR com zeros do estado de onboarding.
 */
export async function dbGetGlobalMetrics(): Promise<GlobalMetrics> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('organizations')
    .select('mrr, calls_this_month, avg_score')
    .not('plan_id', 'is', null)

  if (error) throw new Error(`dbGetGlobalMetrics: ${error.message}`)

  const rows = (data ?? []) as Array<{ mrr: number; calls_this_month: number; avg_score: number }>
  return {
    totalClients: rows.length,
    totalCallsThisMonth: rows.reduce((s, r) => s + (r.calls_this_month ?? 0), 0),
    totalMRR: rows.reduce((s, r) => s + Number(r.mrr ?? 0), 0),
    avgScore: rows.length
      ? Math.round(rows.reduce((s, r) => s + (r.avg_score ?? 0), 0) / rows.length)
      : 0,
  }
}
