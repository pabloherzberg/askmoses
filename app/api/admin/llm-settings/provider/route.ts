import { type NextRequest } from 'next/server'
import { getSession, getRole, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { resolveOpenAIModelId, VALID_MODELS as OPENAI_VALID_MODELS } from '@/lib/openai'
import { VALID_MODELS as GEMINI_VALID_MODELS } from '@/lib/gemini'

interface PatchBody {
  provider?: 'openai' | 'gemini'
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
//   Atualiza chave/modelo de um provider e, opcionalmente, troca qual está
//   ativo (desativa o outro). Persiste em llm_provider_settings (097).
//   Admin only. Nunca retorna a api_key gravada.
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
  if (provider !== 'openai' && provider !== 'gemini') {
    return badRequest("provider deve ser 'openai' ou 'gemini'")
  }

  if (model !== undefined) {
    const whitelist = provider === 'openai' ? OPENAI_VALID_MODELS : GEMINI_VALID_MODELS
    // resolveOpenAIModelId aceita prefixo "openai/"; normaliza antes de checar.
    const sanitized = provider === 'openai' ? resolveOpenAIModelId(model) : model.replace(/^(google\/|models\/)/, '').trim()
    if (!whitelist.has(sanitized)) {
      return badRequest(`model "${model}" não é um modelo válido para ${provider}`)
    }
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
    .select('id, provider, model, is_active')
    .maybeSingle()

  if (updateErr) return serverError('Não foi possível atualizar o provider', updateErr)
  if (!updated) return badRequest(`provider "${provider}" não encontrado — rode a migration 099`)

  if (setActive) {
    // Duas atualizações sequenciais (Supabase JS não faz swap atômico
    // multi-row) — a linha alvo é ativada por último. Janela estreita de
    // "nenhum provider ativo" entre as duas chamadas, documentada e aceita
    // pro escopo desta feature.
    const otherProvider = provider === 'openai' ? 'gemini' : 'openai'
    const { error: deactivateErr } = await admin
      .from('llm_provider_settings')
      .update({ is_active: false })
      .eq('provider', otherProvider)
    if (deactivateErr) return serverError('Não foi possível desativar o outro provider', deactivateErr)

    const { error: activateErr } = await admin
      .from('llm_provider_settings')
      .update({ is_active: true })
      .eq('provider', provider)
    if (activateErr) return serverError('Não foi possível ativar o provider', activateErr)
  }

  return ok({ provider, model: updated.model, isActive: setActive ?? updated.is_active })
}
