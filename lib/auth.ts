import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

export type PlanCode = 'starter' | 'pro' | 'pro_rag'
export type SubscriptionStatus = 'inactive' | 'active' | 'trial'

export interface ActiveOrgContext {
  userId: string
  isSuperAdmin: boolean
  // Admin impersonando: activeOrgId vira o orgId alvo (mesmo que admin não
  // tenha membership). `isImpersonating` distingue esse caso do Owner real
  // — usado por requireOwnerWrite e UI pra esconder botões de mutação.
  isImpersonating: boolean
  activeOrgId: string | null
  role: Role | null
  planCode: PlanCode | null
  hasRag: boolean
  maxSalesPeople: number | null
  maxCallsPerMonth: number | null
  subscriptionStatus: SubscriptionStatus
  trialEndsAt: string | null
}

export interface MembershipOption {
  orgId: string
  orgName: string
  role: Exclude<Role, 'admin'>
}

interface OrgContextRpc {
  activeOrgId: string | null
  role: Role | null
  planCode: PlanCode | null
  hasRag: boolean
  maxSalesPeople: number | null
  maxCallsPerMonth: number | null
  subscriptionStatus: SubscriptionStatus | null
  trialEndsAt: string | null
}

export async function getSession() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// ─── Active-org context — uma rpc por request, memoizada via React.cache ────
// rpc('get_user_org_context') resolve users → memberships → organizations →
// plans num único round trip (pós-039, clients foi mesclado em organizations).
// Para super-admin o JWT já basta — chamamos a rpc só quando ele está
// impersonando (precisa carregar plan/sub da org alvo pra UI Owner funcionar).

async function loadOrgContext(
  userId: string,
  isSuperAdmin: boolean,
  impersonatingOrgId: string | null
): Promise<ActiveOrgContext> {
  if (isSuperAdmin) {
    // Sem impersonate: admin sem org ativa, painel admin opera via service_role.
    if (!impersonatingOrgId) {
      return {
        userId,
        isSuperAdmin: true,
        isImpersonating: false,
        activeOrgId: null,
        role: 'admin',
        planCode: null,
        hasRag: false,
        maxSalesPeople: null,
        maxCallsPerMonth: null,
        // Admin nunca é gated por sub — 'active' aqui evita que checks futuros
        // de plan-gate barrem indevidamente mesmo se esquecerem o isSuperAdmin.
        subscriptionStatus: 'active',
        trialEndsAt: null,
      }
    }

    // Impersonando: lê plan/sub da org alvo direto (sem memberships) pra
    // popular o contexto. Role continua 'admin' (não vira 'owner') — UI usa
    // isImpersonating pra esconder controles de mutação, requireOwnerWrite
    // bloqueia POST/PATCH/PUT/DELETE no API layer.
    const admin = createAdminClient()
    const { data: org } = await admin
      .from('organizations')
      .select('id, subscription_status, trial_ends_at, plans(code, has_rag, max_sales_people, max_calls_per_month)')
      .eq('id', impersonatingOrgId)
      .maybeSingle()

    const plan = (org as { plans?: { code: PlanCode; has_rag: boolean; max_sales_people: number | null; max_calls_per_month: number | null } | null } | null)?.plans ?? null
    return {
      userId,
      isSuperAdmin: true,
      isImpersonating: true,
      activeOrgId: impersonatingOrgId,
      role: 'admin',
      planCode: plan?.code ?? null,
      hasRag: plan?.has_rag ?? false,
      maxSalesPeople: plan?.max_sales_people ?? null,
      maxCallsPerMonth: plan?.max_calls_per_month ?? null,
      // Admin nunca é gated por sub mesmo impersonando — backoffice precisa
      // poder visualizar org com sub inativa (Ariel revisando antes de
      // aplicar trial gratuito).
      subscriptionStatus: 'active',
      trialEndsAt: (org as { trial_ends_at?: string | null } | null)?.trial_ends_at ?? null,
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('get_user_org_context', { p_user_id: userId })
  if (error || !data) {
    return {
      userId,
      isSuperAdmin: false,
      isImpersonating: false,
      activeOrgId: null,
      role: null,
      planCode: null,
      hasRag: false,
      maxSalesPeople: null,
      maxCallsPerMonth: null,
      subscriptionStatus: 'inactive',
      trialEndsAt: null,
    }
  }

  const ctx = data as OrgContextRpc
  return {
    userId,
    isSuperAdmin: false,
    isImpersonating: false,
    activeOrgId: ctx.activeOrgId,
    role: ctx.role,
    planCode: ctx.planCode,
    hasRag: ctx.hasRag,
    maxSalesPeople: ctx.maxSalesPeople,
    maxCallsPerMonth: ctx.maxCallsPerMonth,
    subscriptionStatus: ctx.subscriptionStatus ?? 'inactive',
    trialEndsAt: ctx.trialEndsAt,
  }
}

export const getActiveOrgContext = cache(async (): Promise<ActiveOrgContext | null> => {
  const session = await getSession()
  if (!session) return null
  const meta = session.user.app_metadata ?? {}
  const isSuperAdmin = meta.role === 'admin'
  // Só Admin pode impersonar — claim em outras roles é ignorado defensivamente
  // (não deveria existir, mas a função tolera).
  const impersonatingOrgId = isSuperAdmin
    ? (typeof meta.impersonating_org_id === 'string' ? meta.impersonating_org_id : null)
    : null
  return loadOrgContext(session.user.id, isSuperAdmin, impersonatingOrgId)
})

// Variante sem cookie/session — pra fluxos que já resolveram userId via Bearer
// token (ex.: /api/me no fallback do login antes do cookie propagar). NÃO é
// memoizada porque não tem chave estável de request; calls repetidas =
// queries repetidas. Use só onde getActiveOrgContext() não funciona.
export async function getActiveOrgContextFor(
  userId: string,
  isSuperAdmin: boolean,
  impersonatingOrgId: string | null = null
): Promise<ActiveOrgContext> {
  return loadOrgContext(userId, isSuperAdmin, impersonatingOrgId)
}

export async function getMembershipsForSwitcher(): Promise<MembershipOption[]> {
  const session = await getSession()
  if (!session) return []

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('get_memberships_for_switcher', { p_user_id: session.user.id })
  if (error || !data) return []
  return data as MembershipOption[]
}

// ─── Compat helpers — assinatura antiga, agora derivam do active-org ────────

export async function getRole(): Promise<Role | null> {
  const ctx = await getActiveOrgContext()
  return ctx?.role ?? null
}

export async function getOrgId(): Promise<string | null> {
  const ctx = await getActiveOrgContext()
  return ctx?.activeOrgId ?? null
}

export async function isSuperAdmin(): Promise<boolean> {
  const ctx = await getActiveOrgContext()
  return ctx?.isSuperAdmin ?? false
}

export async function isImpersonating(): Promise<boolean> {
  const ctx = await getActiveOrgContext()
  return ctx?.isImpersonating ?? false
}

export async function getTrainerDbId(): Promise<string | null> {
  const ctx = await getActiveOrgContext()
  if (!ctx?.activeOrgId) return null
  // Em multi-org o user tem N rows em trainers (uma por org) — sem o filtro
  // por org_id, .single() explodia e a página /me caía em branco.
  const admin = createAdminClient()
  const { data } = await admin
    .from('trainers')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('org_id', ctx.activeOrgId)
    .maybeSingle()
  return data?.id ?? null
}

export function redirectByRole(role: Role): string {
  const routes: Record<Role, string> = { trainer: '/me', owner: '/dashboard', admin: '/admin' }
  return routes[role] ?? '/login'
}

// ─── Plan-feature gates ──────────────────────────────────────────────────────

// Retorna uma 403 Response pronta se a org ativa não tem RAG habilitado
// no plano. Caso tenha, devolve null (caller prossegue). Usado por endpoints
// gated por has_rag (TC-12 / TC-13).
export async function requireRagFeature(): Promise<Response | null> {
  const ctx = await getActiveOrgContext()
  if (ctx?.hasRag) return null
  return Response.json(
    {
      data: null,
      error: {
        message: 'Feature de RAG disponível apenas no plano Pro + RAG. Faça upgrade pra acessar.',
        code: 403,
        reason: 'PLAN_RAG_REQUIRED',
      },
    },
    { status: 403 }
  )
}

// Retorna 402 Payment Required se a org ativa está com subscription
// inativa (Owner ainda não pagou plano). Admin sempre passa — isSuperAdmin
// bypass garantido em loadOrgContext que retorna 'active' pra admin.
// 'trial' conta como ativa enquanto trial_ends_at > now() — get_user_org_context
// (migration 040) já flippa pra 'inactive' on-read quando o trial expira,
// então tratar 'trial' como ativa aqui é seguro.
// 402 (em vez de 403) distingue 'precisa pagar' de 'sem permissão' — front
// pode ter handler global que redireciona pra /settings/billing nesse caso.
// Não aplica em rotas de onboarding/billing/auth (essas precisam ser
// acessíveis pra Owner sub-inativa concluir o pagamento).
export async function requireActiveSubscription(): Promise<Response | null> {
  const ctx = await getActiveOrgContext()
  if (ctx?.isSuperAdmin) return null
  if (ctx?.subscriptionStatus === 'active' || ctx?.subscriptionStatus === 'trial') return null
  return Response.json(
    {
      data: null,
      error: {
        message: 'Plano inativo. Acesse a área de billing para assinar e desbloquear o recurso.',
        code: 402,
        reason: 'NO_ACTIVE_SUBSCRIPTION',
      },
    },
    { status: 402 }
  )
}

// Retorna 403 se o caller é Admin impersonando uma org. Admin é read-only
// dentro de orgs (decisão Victor 2026-05-13) — deve barrar qualquer mutation
// no API layer. Defesa em profundidade: as RLS policies de write usam
// current_org_for_write() (migration 040) que também não aceita impersonate,
// então mesmo se este helper for esquecido o DB rejeita.
// Aplicar no topo de todo endpoint POST/PATCH/PUT/DELETE que modifica
// dados da org (calls, rubrics, scripts, invites, marketing-intelligence/run,
// trainers, etc.). NÃO aplicar em endpoints próprios do admin
// (/api/admin/*, /api/organizations) — esses são opções dele.
export async function requireOwnerWrite(): Promise<Response | null> {
  const ctx = await getActiveOrgContext()
  if (ctx?.isImpersonating) {
    return Response.json(
      {
        data: null,
        error: {
          message: 'Modo visualização: ações de escrita estão desabilitadas. Saia do modo cliente para operar na sua própria org.',
          code: 403,
          reason: 'ADMIN_IMPERSONATING_READ_ONLY',
        },
      },
      { status: 403 }
    )
  }
  return null
}

// ─── Response helpers ────────────────────────────────────────────────────────

export function unauthorized() {
  return Response.json({ data: null, error: { message: 'Não autenticado', code: 401 } }, { status: 401 })
}

export function forbidden() {
  return Response.json({ data: null, error: { message: 'Acesso não autorizado', code: 403 } }, { status: 403 })
}

export function notFound(entity = 'Recurso') {
  return Response.json({ data: null, error: { message: `${entity} não encontrado`, code: 404 } }, { status: 404 })
}

export function ok<T>(data: T) {
  return Response.json({ data, error: null })
}
