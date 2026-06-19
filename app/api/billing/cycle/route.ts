import { type NextRequest } from 'next/server'
import { getSession, getActiveOrgContext, ok, unauthorized, forbidden } from '@/lib/auth'
import { getAdminCycle, getOwnerCycle } from '@/lib/services/billing'

export const dynamic = 'force-dynamic'

/** Valida "YYYY-MM"; fallback pro mês corrente (UTC). */
function normalizeMonth(raw: string | null): string {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) return raw
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

// GET /api/billing/cycle?scope=admin|owner&month=YYYY-MM
//   Bloco 2 (calendar month). Admin → tabela de orgs + cogs. Owner → cycle da
//   própria org + histórico, SEM cogs/rows/llmCost (o service owner nem retorna
//   esses campos — defesa em profundidade, não só no front).
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const ctx = await getActiveOrgContext()
  if (!ctx) return unauthorized()

  const url = new URL(request.url)
  const month = normalizeMonth(url.searchParams.get('month'))
  const wantsAdmin = url.searchParams.get('scope') === 'admin'

  try {
    if (wantsAdmin) {
      if (ctx.role !== 'admin') return forbidden()
      return ok(await getAdminCycle(month))
    }
    if (!ctx.activeOrgId) return forbidden()
    return ok(await getOwnerCycle(ctx.activeOrgId, month))
  } catch (err) {
    console.error('[billing/cycle] query failed', err)
    return Response.json(
      { data: null, error: { message: 'Erro interno', code: 500 } },
      { status: 500 },
    )
  }
}
