import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSameOrigin } from '@/lib/auth/csrf'
import type { BillingStatus, Role } from '@/lib/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Teto sanitário: $100/min em micros. Evita typo catastrófico (ex.: confundir
// micros com a unidade e gravar um número absurdo).
const MAX_RATE_MICROS = 100_000_000

// Espelha o CHECK constraint organizations_billing_status_check (migration 082).
const BILLING_STATUSES: readonly BillingStatus[] = ['PAID', 'PILOT', 'DEMO', 'DISABLED']

interface PatchBody {
  // Tarifa por minuto em micro-USD (1 USD = 1e6). Ex.: 66700 = $0,0667/min.
  ratePerMinuteMicros?: number
  // Status de cobrança da org. Independe de subscription_status.
  billingStatus?: BillingStatus
}

function badRequest(message: string, reason: string) {
  return Response.json({ data: null, error: { message, code: 400, reason } }, { status: 400 })
}

function serverError(context: string, err?: unknown) {
  console.error(`[admin/organizations/billing-rate] ${context}`, err)
  return Response.json({ data: null, error: { message: 'Erro interno', code: 500, reason: 'INTERNAL_ERROR' } }, { status: 500 })
}

// notFound com `reason` — evita alterar a assinatura do helper compartilhado
// de lib/auth.ts (usado por dezenas de rotas fora do escopo desta correção).
function orgNotFound() {
  return Response.json(
    { data: null, error: { message: 'Organização não encontrada', code: 404, reason: 'ORG_NOT_FOUND' } },
    { status: 404 },
  )
}

// PATCH /api/admin/organizations/[id]/billing-rate
//   Body: { ratePerMinuteMicros?, billingStatus? } — ao menos um dos dois.
//
//   Ajustes de cobrança por org, persistidos em organizations
//   (rate_per_minute_micros + billing_status, migrations 082/106):
//
//     • ratePerMinuteMicros — tarifa negociada por org.
//     • billingStatus — PAID | PILOT | DEMO | DISABLED. É o ÚNICO caminho de
//       escrita desta coluna: antes da 106 nada no app a alterava e toda org
//       ficava presa no default 'PILOT' (receita zerada com COGS real). NÃO
//       mexe em subscription_status de propósito — um eixo governa cobrança, o
//       outro governa acesso ao produto (ver COMMENT da coluna na 082).
//
//   Chamado pelo dialog da BillingTable em /admin/billing. Admin only.
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

  const { id: orgId } = await params
  if (!orgId || !UUID_RE.test(orgId)) return badRequest('orgId inválido', 'INVALID_ORG_ID')

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return badRequest('Body inválido', 'INVALID_BODY')
  }

  const { ratePerMinuteMicros: micros, billingStatus } = body

  if (micros === undefined && billingStatus === undefined) {
    return badRequest(
      'Forneça ao menos um campo: ratePerMinuteMicros ou billingStatus',
      'NO_FIELDS',
    )
  }

  if (
    micros !== undefined &&
    (typeof micros !== 'number' ||
      !Number.isInteger(micros) ||
      micros < 0 ||
      micros > MAX_RATE_MICROS)
  ) {
    return badRequest('ratePerMinuteMicros deve ser um inteiro entre 0 e 100000000 (micro-USD)', 'INVALID_RATE')
  }

  if (billingStatus !== undefined && !BILLING_STATUSES.includes(billingStatus)) {
    return badRequest('billingStatus deve ser "PAID", "PILOT", "DEMO" ou "DISABLED"', 'INVALID_STATUS')
  }

  // Update parcial — só o que veio no body. Mandar a chave ausente como null
  // violaria o NOT NULL das duas colunas.
  const patch: Record<string, unknown> = {}
  if (micros !== undefined) patch.rate_per_minute_micros = micros
  if (billingStatus !== undefined) patch.billing_status = billingStatus

  const admin = createAdminClient()

  const { data: updated, error: updateErr } = await admin
    .from('organizations')
    .update(patch)
    .eq('id', orgId)
    .select('id, name, rate_per_minute_micros, billing_status')
    .maybeSingle()

  if (updateErr) return serverError('Não foi possível atualizar a cobrança', updateErr)
  if (!updated) return orgNotFound()

  return ok({
    id: updated.id,
    name: updated.name,
    ratePerMinuteMicros: updated.rate_per_minute_micros,
    billingStatus: updated.billing_status as BillingStatus,
  })
}
