import { type NextRequest } from 'next/server'
import { getActiveOrgContext, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const PLAN_CODES = ['starter', 'pro', 'pro_rag'] as const
type PlanCode = (typeof PLAN_CODES)[number]

// Mapeia code do plans → label legado em owners.plan (text CHECK constraint).
// Mantido aqui só pra preencher o campo redundante; fonte canônica pós-merge
// (migration 038) é organizations.plan_id (clients table foi dropada).
const OWNERS_PLAN_LABEL: Record<PlanCode, string> = {
  starter: 'Starter',
  pro: 'Pro',
  pro_rag: 'Pro+RAG',
}

interface SubscribeBody {
  planCode?: string
}

function badRequest(message: string, reason?: string) {
  return Response.json(
    { data: null, error: { message, code: 400, ...(reason ? { reason } : {}) } },
    { status: 400 }
  )
}

function conflict(message: string, reason?: string) {
  return Response.json(
    { data: null, error: { message, code: 409, ...(reason ? { reason } : {}) } },
    { status: 409 }
  )
}

function serverError(context: string, err?: unknown) {
  console.error(`[onboarding/subscribe] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 }
  )
}

// POST /api/onboarding/subscribe
//   Body: { planCode: 'starter' | 'pro' | 'pro_rag' }
//   Stub atual: atualiza clients.{plan_id, subscription_status='active'}
//   direto, sem passar por Stripe. Retorna { success: true, checkoutUrl: null }.
//
//   Contrato forward-compatible com a integração futura do Stripe:
//     - Quando o outro dev plugar Stripe Checkout, esse endpoint passa a
//       criar uma Checkout Session e retornar { success: false, checkoutUrl: '...' }
//     - Frontend faz: `if (checkoutUrl) window.location = checkoutUrl else next()`
//     - Webhook do Stripe (rota separada, dele) marca subscription_status='active'
//       quando checkout.session.completed chegar
//
//   Auth: owner com sub 'inactive'. Outros casos:
//     401 sem sessão | 403 não-owner | 409 já tem sub ativa | 400 planCode inválido
export async function POST(request: NextRequest) {
  const ctx = await getActiveOrgContext()
  if (!ctx) return unauthorized()

  if (ctx.role !== 'owner' || !ctx.activeOrgId) return forbidden()

  if (ctx.subscriptionStatus === 'active') {
    return conflict(
      'Você já tem um plano ativo. Acesse a área de billing para mudar de plano.',
      'ALREADY_ACTIVE'
    )
  }

  let body: SubscribeBody
  try {
    body = (await request.json()) as SubscribeBody
  } catch {
    return badRequest('Body inválido')
  }

  const planCode = body.planCode as PlanCode | undefined
  if (!planCode || !PLAN_CODES.includes(planCode)) {
    return badRequest('planCode deve ser "starter", "pro" ou "pro_rag"', 'PLAN_INVALID')
  }

  const admin = createAdminClient()

  // Resolve plan_id pelo code (plans table tem CHECK em code, mas o id é UUID
  // separado). Mantém o mesmo padrão de POST /api/organizations admin.
  const { data: plan, error: planErr } = await admin
    .from('plans')
    .select('id, code')
    .eq('code', planCode)
    .maybeSingle()
  if (planErr) return serverError('Não foi possível resolver o plano', planErr)
  if (!plan) return badRequest('plano não encontrado', 'PLAN_NOT_FOUND')

  // STUB: ativa direto na própria organization. Pós-merge (migration 038)
  // plan_id e subscription_status vivem em organizations — não há mais um
  // client espelho separado. Quando Stripe entrar, esse passo migra pro
  // webhook e o response passa a retornar { success: false, checkoutUrl }.
  const { error: updateErr } = await admin
    .from('organizations')
    .update({
      plan_id: plan.id,
      subscription_status: 'active',
    })
    .eq('id', ctx.activeOrgId)
  if (updateErr) return serverError('Não foi possível ativar a assinatura', updateErr)

  // Manter owners.plan (campo legacy text) sincronizado pra não quebrar
  // queries antigas que lêem ele em vez de plans.code. Falha aqui NÃO
  // reverte a subscription — a fonte de verdade é organizations.plan_id +
  // organizations.subscription_status, que já está consistente. Logamos
  // pra inspeção; o pior caso é owners.plan ficar stale numa leitura legacy.
  const { error: ownersUpdateErr } = await admin
    .from('owners')
    .update({ plan: OWNERS_PLAN_LABEL[planCode] })
    .eq('user_id', ctx.userId)
    .eq('org_id', ctx.activeOrgId)
  if (ownersUpdateErr) {
    console.warn('[onboarding/subscribe] owners.plan update falhou — campo legacy ficou stale', {
      userId: ctx.userId,
      orgId: ctx.activeOrgId,
      planCode,
      err: ownersUpdateErr,
    })
  }

  return ok({
    success: true,
    checkoutUrl: null,
    planCode: plan.code,
  })
}
