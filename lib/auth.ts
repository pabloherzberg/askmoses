import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

export type PlanCode = 'starter' | 'pro' | 'pro_rag'
export type SubscriptionStatus = 'inactive' | 'active'

export interface ActiveOrgContext {
  userId: string
  isSuperAdmin: boolean
  activeOrgId: string | null
  role: Role | null
  planCode: PlanCode | null
  hasRag: boolean
  maxSalesPeople: number | null
  maxCallsPerMonth: number | null
  subscriptionStatus: SubscriptionStatus
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
}

export async function getSession() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// ─── Active-org context — uma rpc por request, memoizada via React.cache ────
// rpc('get_user_org_context') resolve users → memberships → organizations →
// clients → plans num único round trip. Para super-admin o JWT já basta;
// não chamamos a rpc (admin geralmente tem active_org_id NULL).

async function loadOrgContext(userId: string, isSuperAdmin: boolean): Promise<ActiveOrgContext> {
  if (isSuperAdmin) {
    return {
      userId,
      isSuperAdmin: true,
      activeOrgId: null,
      role: 'admin',
      planCode: null,
      hasRag: false,
      maxSalesPeople: null,
      maxCallsPerMonth: null,
      // Admin nunca é gated por sub — 'active' aqui evita que checks futuros
      // de plan-gate barrem indevidamente mesmo se esquecerem o isSuperAdmin.
      subscriptionStatus: 'active',
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('get_user_org_context', { p_user_id: userId })
  if (error || !data) {
    return {
      userId,
      isSuperAdmin: false,
      activeOrgId: null,
      role: null,
      planCode: null,
      hasRag: false,
      maxSalesPeople: null,
      maxCallsPerMonth: null,
      subscriptionStatus: 'inactive',
    }
  }

  const ctx = data as OrgContextRpc
  return {
    userId,
    isSuperAdmin: false,
    activeOrgId: ctx.activeOrgId,
    role: ctx.role,
    planCode: ctx.planCode,
    hasRag: ctx.hasRag,
    maxSalesPeople: ctx.maxSalesPeople,
    maxCallsPerMonth: ctx.maxCallsPerMonth,
    subscriptionStatus: ctx.subscriptionStatus ?? 'inactive',
  }
}

export const getActiveOrgContext = cache(async (): Promise<ActiveOrgContext | null> => {
  const session = await getSession()
  if (!session) return null
  return loadOrgContext(session.user.id, session.user.app_metadata?.role === 'admin')
})

// Variante sem cookie/session — pra fluxos que já resolveram userId via Bearer
// token (ex.: /api/me no fallback do login antes do cookie propagar). NÃO é
// memoizada porque não tem chave estável de request; calls repetidas =
// queries repetidas. Use só onde getActiveOrgContext() não funciona.
export async function getActiveOrgContextFor(
  userId: string,
  isSuperAdmin: boolean
): Promise<ActiveOrgContext> {
  return loadOrgContext(userId, isSuperAdmin)
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
