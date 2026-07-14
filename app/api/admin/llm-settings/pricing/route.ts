import { type NextRequest } from 'next/server'
import { getSession, getRole, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { isValidProvider, PROVIDER_LIST } from '@/lib/llm/registry'

interface PostBody {
  provider?: string
  model?: string
  unit?: 'per_1m_tokens' | 'per_minute'
  input_usd_per_1m?: number | null
  output_usd_per_1m?: number | null
  usd_per_minute?: number | null
}

function badRequest(message: string) {
  return Response.json({ data: null, error: { message, code: 400 } }, { status: 400 })
}

function serverError(context: string, err?: unknown) {
  console.error(`[admin/llm-settings/pricing] ${context}`, err)
  return Response.json({ data: null, error: { message: 'Erro interno', code: 500 } }, { status: 500 })
}

// GET /api/admin/llm-settings/pricing?provider=&model=
//   Histórico de preços (ativos e inativos) de um (provider, model),
//   ordenado do mais recente pro mais antigo. Admin only.
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role !== 'admin') return forbidden()

  const { searchParams } = new URL(request.url)
  const provider = searchParams.get('provider')
  const model = searchParams.get('model')
  if (!provider || !model) return badRequest('provider e model são obrigatórios')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('llm_pricing')
    .select('id, provider, model, unit, input_usd_per_1m, output_usd_per_1m, usd_per_minute, effective_from, active')
    .eq('provider', provider)
    .eq('model', model)
    .order('effective_from', { ascending: false })

  if (error) return serverError('Não foi possível buscar histórico de preço', error)

  return ok({ history: data ?? [] })
}

// POST /api/admin/llm-settings/pricing
//   Body: { provider, model, unit, input_usd_per_1m?, output_usd_per_1m?, usd_per_minute? }
//   Insere uma NOVA VERSÃO de preço (effective_from=now, active=true) e
//   desativa a versão anterior do mesmo (provider, model) — nunca faz UPDATE
//   nos valores de uma linha existente (ver header de scripts/088). Admin only.
export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role !== 'admin') return forbidden()

  let body: PostBody
  try {
    body = (await request.json()) as PostBody
  } catch {
    return badRequest('Body inválido')
  }

  const { provider, model, unit, input_usd_per_1m, output_usd_per_1m, usd_per_minute } = body
  if (typeof provider !== 'string' || !isValidProvider(provider)) {
    return badRequest(`provider inválido — suportados: ${PROVIDER_LIST.map((p) => p.id).join(', ')}`)
  }
  if (!model || typeof model !== 'string') return badRequest('model é obrigatório')
  if (unit !== 'per_1m_tokens' && unit !== 'per_minute') {
    return badRequest("unit deve ser 'per_1m_tokens' ou 'per_minute'")
  }
  if (unit === 'per_1m_tokens') {
    if (typeof input_usd_per_1m !== 'number' || typeof output_usd_per_1m !== 'number') {
      return badRequest('input_usd_per_1m e output_usd_per_1m são obrigatórios para unit=per_1m_tokens')
    }
    if (input_usd_per_1m < 0 || output_usd_per_1m < 0) return badRequest('preços não podem ser negativos')
  } else {
    if (typeof usd_per_minute !== 'number' || usd_per_minute < 0) {
      return badRequest('usd_per_minute é obrigatório e não-negativo para unit=per_minute')
    }
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { error: deactivateErr } = await admin
    .from('llm_pricing')
    .update({ active: false })
    .eq('provider', provider)
    .eq('model', model)
    .eq('active', true)

  if (deactivateErr) return serverError('Não foi possível desativar a versão anterior', deactivateErr)

  const { data: inserted, error: insertErr } = await admin
    .from('llm_pricing')
    .insert({
      provider,
      model,
      unit,
      input_usd_per_1m: unit === 'per_1m_tokens' ? input_usd_per_1m : null,
      output_usd_per_1m: unit === 'per_1m_tokens' ? output_usd_per_1m : null,
      usd_per_minute: unit === 'per_minute' ? usd_per_minute : null,
      effective_from: now,
      active: true,
    })
    .select('id, provider, model, unit, input_usd_per_1m, output_usd_per_1m, usd_per_minute, effective_from, active')
    .single()

  if (insertErr) return serverError('Não foi possível criar nova versão de preço', insertErr)

  return ok({ pricing: inserted })
}
