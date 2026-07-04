import { getSession, getRole, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LlmProvider, LlmProviderSetting, LlmPricingRow } from '@/lib/types'

function maskKey(apiKey: string | null): { hasKey: boolean; keyHint: string | null } {
  if (!apiKey) return { hasKey: false, keyHint: null }
  const tail = apiKey.slice(-4)
  const prefix = apiKey.slice(0, apiKey.includes('-') ? apiKey.indexOf('-') + 1 : 2)
  return { hasKey: true, keyHint: `${prefix}...${tail}` }
}

// GET /api/admin/llm-settings
//   Retorna as 2 linhas de provider (openai/gemini) com api_key mascarada, e
//   as linhas ativas de llm_pricing (COGS) de ambos os providers. Admin only.
export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role !== 'admin') return forbidden()

  const admin = createAdminClient()

  const [{ data: providerRows, error: providerErr }, { data: pricingRows, error: pricingErr }] =
    await Promise.all([
      admin
        .from('llm_provider_settings')
        .select('id, provider, api_key, model, is_active, updated_by, updated_at')
        .order('provider', { ascending: true }),
      admin
        .from('llm_pricing')
        .select('id, provider, model, unit, input_usd_per_1m, output_usd_per_1m, usd_per_minute, effective_from, active')
        .eq('active', true)
        .order('provider', { ascending: true })
        .order('model', { ascending: true }),
    ])

  if (providerErr) {
    console.error('[admin/llm-settings] GET provider settings failed', providerErr)
    return Response.json({ data: null, error: { message: 'Erro interno', code: 500 } }, { status: 500 })
  }
  if (pricingErr) {
    console.error('[admin/llm-settings] GET pricing failed', pricingErr)
    return Response.json({ data: null, error: { message: 'Erro interno', code: 500 } }, { status: 500 })
  }

  const providers: LlmProviderSetting[] = (providerRows ?? []).map((r) => {
    const { hasKey, keyHint } = maskKey(r.api_key as string | null)
    return {
      id: r.id as string,
      provider: r.provider as LlmProvider,
      hasKey,
      keyHint,
      model: r.model as string,
      is_active: r.is_active as boolean,
      updated_by: (r.updated_by as string | null) ?? null,
      updated_at: r.updated_at as string,
    }
  })

  const pricing: LlmPricingRow[] = (pricingRows ?? []).map((r) => ({
    id: r.id as string,
    provider: r.provider as LlmProvider,
    model: r.model as string,
    unit: r.unit as 'per_1m_tokens' | 'per_minute',
    input_usd_per_1m: r.input_usd_per_1m as number | null,
    output_usd_per_1m: r.output_usd_per_1m as number | null,
    usd_per_minute: r.usd_per_minute as number | null,
    effective_from: r.effective_from as string,
    active: r.active as boolean,
  }))

  return ok({ providers, pricing })
}
