import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden, notFound } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSameOrigin } from '@/lib/auth/csrf'
import type { Role } from '@/lib/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Teto sanitário: $100/min em micros. Evita typo catastrófico (ex.: confundir
// micros com a unidade e gravar um número absurdo).
const MAX_RATE_MICROS = 100_000_000

interface PatchBody {
  // Tarifa por minuto em micro-USD (1 USD = 1e6). Ex.: 66700 = $0,0667/min.
  ratePerMinuteMicros?: number
}

function badRequest(message: string) {
  return Response.json({ data: null, error: { message, code: 400 } }, { status: 400 })
}

function serverError(context: string, err?: unknown) {
  console.error(`[admin/organizations/billing-rate] ${context}`, err)
  return Response.json({ data: null, error: { message: 'Erro interno', code: 500 } }, { status: 500 })
}

// PATCH /api/admin/organizations/[id]/billing-rate
//   Body: { ratePerMinuteMicros }
//   Ajuste manual da tarifa de cobrança por org (negociação). Persiste em
//   organizations.rate_per_minute_micros (migration 082). Admin only.
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
  if (!orgId || !UUID_RE.test(orgId)) return badRequest('orgId inválido')

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return badRequest('Body inválido')
  }

  const micros = body.ratePerMinuteMicros
  if (
    typeof micros !== 'number' ||
    !Number.isInteger(micros) ||
    micros < 0 ||
    micros > MAX_RATE_MICROS
  ) {
    return badRequest('ratePerMinuteMicros deve ser um inteiro entre 0 e 100000000 (micro-USD)')
  }

  const admin = createAdminClient()

  const { data: updated, error: updateErr } = await admin
    .from('organizations')
    .update({ rate_per_minute_micros: micros })
    .eq('id', orgId)
    .select('id, name, rate_per_minute_micros')
    .maybeSingle()

  if (updateErr) return serverError('Não foi possível atualizar a tarifa', updateErr)
  if (!updated) return notFound('Organização')

  return ok({
    id: updated.id,
    name: updated.name,
    ratePerMinuteMicros: updated.rate_per_minute_micros,
  })
}
