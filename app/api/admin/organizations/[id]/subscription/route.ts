import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden, notFound } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimitDb, rateLimitedResponse } from '@/lib/auth/rate-limit'
import { requireSameOrigin } from '@/lib/auth/csrf'
import type { Role } from '@/lib/types'

// 30 overrides/admin/min — sweetheart deal flow não é high-frequency.
const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_SECONDS = 60

type SubStatus = 'active' | 'inactive' | 'trial'
type PlanCode = 'starter' | 'pro' | 'pro_rag'

interface PatchBody {
  status?: SubStatus
  planCode?: PlanCode
  // ISO 8601 — só relevante quando status='trial'. Pra outros status, é
  // limpado (set NULL). Frontend computa o timestamp a partir do select de
  // duração (24h, 7d, 14d, 30d, 60d, 90d, custom).
  trialEndsAt?: string | null
}

const STATUSES: readonly SubStatus[] = ['active', 'inactive', 'trial']
const PLANS: readonly PlanCode[] = ['starter', 'pro', 'pro_rag']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(message: string) {
  return Response.json(
    { data: null, error: { message, code: 400 } },
    { status: 400 }
  )
}

function serverError(context: string, err?: unknown) {
  console.error(`[admin/organizations/subscription] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 }
  )
}

// PATCH /api/admin/organizations/[id]/subscription
//   Body: { status?, planCode?, trialEndsAt? }
//
//   Override manual de subscription (decisão Victor 2026-05-13, Q5).
//   Usado pelos sweetheart deals: Ariel dá trial gratuito ou troca o
//   plano sem passar pelo Stripe. Seta admin_override=true pra futuro
//   webhook do Stripe respeitar o que o Admin definiu.
//
//   Validações:
//   - status='trial' EXIGE trialEndsAt no futuro.
//   - status='active'|'inactive' limpa trialEndsAt (NULL) — coerência
//     com a função get_user_org_context que só lê trial_ends_at quando
//     status='trial'.
//   - Aceita updates parciais (só status, só plano, ou combo).
//
//   Admin only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  const rl = await checkRateLimitDb(
    `subscription_override:${session.user.id}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_SECONDS,
  )
  if (!rl.allowed) return rateLimitedResponse(rl)

  const { id: orgId } = await params
  if (!orgId || !UUID_RE.test(orgId)) return badRequest('orgId inválido')

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return badRequest('Body inválido')
  }

  const { status, planCode, trialEndsAt } = body

  if (status === undefined && planCode === undefined && trialEndsAt === undefined) {
    return badRequest('Forneça pelo menos um campo: status, planCode ou trialEndsAt')
  }
  if (status !== undefined && !STATUSES.includes(status)) {
    return badRequest('status deve ser "active", "inactive" ou "trial"')
  }
  if (planCode !== undefined && !PLANS.includes(planCode)) {
    return badRequest('planCode deve ser "starter", "pro" ou "pro_rag"')
  }

  // Resolve trialEndsAt efetivo. Regra: se status='trial', exige data futura;
  // se status='active'|'inactive', limpa pra NULL. Update parcial (sem status
  // no body) preserva o que está no DB — pula essa lógica.
  let nextTrialEndsAt: string | null | undefined
  if (status === 'trial') {
    if (!trialEndsAt) return badRequest('trialEndsAt é obrigatório quando status="trial"')
    const t = new Date(trialEndsAt)
    if (isNaN(t.getTime())) return badRequest('trialEndsAt inválido (use ISO 8601)')
    if (t.getTime() <= Date.now()) return badRequest('trialEndsAt deve ser no futuro')
    nextTrialEndsAt = t.toISOString()
  } else if (status === 'active' || status === 'inactive') {
    // Limpeza explícita — qualquer trial em curso some.
    nextTrialEndsAt = null
  } else if (trialEndsAt !== undefined) {
    // Update parcial só de trialEndsAt (sem mudar status): valida mas não
    // limpa. Caso típico: estender um trial em curso ("dei mais 30 dias").
    if (trialEndsAt === null) {
      nextTrialEndsAt = null
    } else {
      const t = new Date(trialEndsAt)
      if (isNaN(t.getTime())) return badRequest('trialEndsAt inválido (use ISO 8601)')
      if (t.getTime() <= Date.now()) return badRequest('trialEndsAt deve ser no futuro')
      nextTrialEndsAt = t.toISOString()
    }
  }

  const admin = createAdminClient()

  // Org existe?
  const { data: existing, error: lookupErr } = await admin
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .maybeSingle()
  if (lookupErr) return serverError('Não foi possível validar a organização', lookupErr)
  if (!existing) return notFound('Organização')

  // Resolve plan_id quando planCode no body
  let nextPlanId: string | undefined
  if (planCode !== undefined) {
    const { data: plan, error: planErr } = await admin
      .from('plans')
      .select('id')
      .eq('code', planCode)
      .maybeSingle()
    if (planErr) return serverError('Não foi possível resolver o plano', planErr)
    if (!plan) return badRequest('plano não encontrado')
    nextPlanId = plan.id
  }

  // Monta patch — admin_override sempre true (esse endpoint só é chamado
  // por ação Admin manual; webhook Stripe usa rota separada).
  const patch: Record<string, unknown> = { admin_override: true }
  if (status !== undefined) patch.subscription_status = status
  if (nextPlanId !== undefined) patch.plan_id = nextPlanId
  if (nextTrialEndsAt !== undefined) patch.trial_ends_at = nextTrialEndsAt

  const { data: updated, error: updateErr } = await admin
    .from('organizations')
    .update(patch)
    .eq('id', orgId)
    .select('id, name, subscription_status, plan_id, trial_ends_at, admin_override')
    .single()
  if (updateErr || !updated) return serverError('Não foi possível atualizar subscription', updateErr)

  return ok({
    id: updated.id,
    name: updated.name,
    subscriptionStatus: updated.subscription_status as SubStatus,
    planId: updated.plan_id,
    trialEndsAt: updated.trial_ends_at,
    adminOverride: updated.admin_override,
  })
}
