import { type NextRequest } from 'next/server'
import { getSession, getRole, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { getProviderDef, isValidProvider, PROVIDER_LIST } from '@/lib/llm/registry'

interface PatchBody {
  provider?: string
  apiKey?: string
  model?: string
  setActive?: boolean
}

function badRequest(message: string) {
  return Response.json({ data: null, error: { message, code: 400 } }, { status: 400 })
}

function serverError(context: string, err?: unknown) {
  console.error(`[admin/llm-settings/provider] ${context}`, err)
  return Response.json({ data: null, error: { message: 'Erro interno', code: 500 } }, { status: 500 })
}

// PATCH /api/admin/llm-settings/provider
//   Body: { provider, apiKey?, model?, setActive? }
//   Atualiza chave/modelo de um provider e, opcionalmente, o torna o ativo
//   (desativa os demais). Persiste em llm_provider_settings (099). Admin only.
//   Nunca retorna a api_key gravada.
//
//   Provider/modelo são validados contra o registry (lib/llm/registry.ts) —
//   adicionar um provider novo lá basta pra esta rota aceitá-lo.
//   Guard: só permite ATIVAR um provider que tenha chave utilizável (no banco
//   ou na env) — sem chave, o pipeline cairia calado no fallback.
export async function PATCH(request: NextRequest) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role !== 'admin') return forbidden()

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return badRequest('Body inválido')
  }

  const { provider, apiKey, model, setActive } = body
  if (typeof provider !== 'string' || !isValidProvider(provider)) {
    return badRequest(`provider inválido — suportados: ${PROVIDER_LIST.map((p) => p.id).join(', ')}`)
  }
  const def = getProviderDef(provider)!

  if (model !== undefined && !def.isValidModel(model)) {
    return badRequest(`model "${model}" não é um modelo válido para ${provider}`)
  }

  const admin = createAdminClient()

  const patch: Record<string, unknown> = {
    updated_by: session.user.email ?? 'admin',
    updated_at: new Date().toISOString(),
  }
  if (apiKey !== undefined) patch.api_key = apiKey.trim() || null
  if (model !== undefined) patch.model = model

  const { data: updated, error: updateErr } = await admin
    .from('llm_provider_settings')
    .update(patch)
    .eq('provider', provider)
    .select('id, provider, model, is_active, api_key')
    .maybeSingle()

  if (updateErr) return serverError('Não foi possível atualizar o provider', updateErr)
  if (!updated) return badRequest(`provider "${provider}" não encontrado — rode a migration 099`)

  if (setActive) {
    // Guard: exige chave utilizável (banco OU env) antes de ativar.
    const effectiveKey = (updated.api_key as string | null) ?? process.env[def.envKey] ?? null
    if (!effectiveKey) {
      return badRequest(
        `configure a chave de API de ${def.label} antes de defini-lo como ativo`,
      )
    }

    // O índice único parcial (is_active WHERE is_active) proíbe dois ativos ao
    // mesmo tempo, então NÃO dá pra ativar o alvo antes de desativar os demais.
    // Ordem obrigatória: desativar todos os outros, depois ativar o alvo. A
    // janela curta de "zero ativos" entre as duas queries cai no fallback env
    // (getActiveLlmModel nunca quebra), então é aceitável sem transação.
    const { error: deactivateErr } = await admin
      .from('llm_provider_settings')
      .update({ is_active: false })
      .neq('provider', provider)
    if (deactivateErr) return serverError('Não foi possível desativar os outros providers', deactivateErr)

    const { error: activateErr } = await admin
      .from('llm_provider_settings')
      .update({ is_active: true })
      .eq('provider', provider)
    if (activateErr) return serverError('Não foi possível ativar o provider', activateErr)
  }

  return ok({ provider, model: updated.model, isActive: setActive ? true : updated.is_active })
}
