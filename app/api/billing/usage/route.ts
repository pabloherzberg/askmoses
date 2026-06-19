import { type NextRequest } from 'next/server'
import { getSession, getActiveOrgContext, ok, unauthorized, forbidden } from '@/lib/auth'
import { getAdminUsage, getOwnerUsage } from '@/lib/services/billing'
import type { BillingPeriodRange } from '@/lib/types'

export const dynamic = 'force-dynamic'

const VALID_RANGES: BillingPeriodRange[] = ['1w', '2w', '3w', '1m']

function normalizeRange(raw: string | null): BillingPeriodRange {
  return raw && (VALID_RANGES as string[]).includes(raw) ? (raw as BillingPeriodRange) : '1m'
}

// GET /api/billing/usage?scope=admin|owner&range=1w|2w|3w|1m
//   Bloco 1 (rolling window). Admin → todas as orgs + bar list. Owner → só a
//   própria org (orgId do contexto, nunca do query param) + sparkline.
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const ctx = await getActiveOrgContext()
  if (!ctx) return unauthorized()

  const url = new URL(request.url)
  const range = normalizeRange(url.searchParams.get('range'))
  const wantsAdmin = url.searchParams.get('scope') === 'admin'

  try {
    if (wantsAdmin) {
      if (ctx.role !== 'admin') return forbidden()
      return ok(await getAdminUsage(range))
    }
    // Owner/trainer: usa o activeOrgId do contexto (impersonation incluída).
    if (!ctx.activeOrgId) return forbidden()
    return ok(await getOwnerUsage(ctx.activeOrgId, range))
  } catch (err) {
    console.error('[billing/usage] query failed', err)
    return Response.json(
      { data: null, error: { message: 'Erro interno', code: 500 } },
      { status: 500 },
    )
  }
}
