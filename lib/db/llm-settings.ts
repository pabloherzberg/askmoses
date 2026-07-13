import { createAdminClient } from '@/lib/supabase/admin'
import type { LlmProvider, LlmProviderSetting, LlmPricingRow } from '@/lib/types'

// ─── Leitura admin de provider + pricing (masca a api_key) ────────────────────
//
// Compartilhado pela página server-side (/admin/llm-config) e pela rota
// GET /api/admin/llm-settings. A api_key NUNCA sai daqui em texto — só o hint
// mascarado. Só service-role (createAdminClient) lê estas tabelas (RLS sem
// policy). Ver scripts/099 (provider) e 088/100 (pricing).

export function maskKey(apiKey: string | null): { hasKey: boolean; keyHint: string | null } {
  if (!apiKey) return { hasKey: false, keyHint: null }
  const tail = apiKey.slice(-4)
  const prefix = apiKey.slice(0, apiKey.includes('-') ? apiKey.indexOf('-') + 1 : 2)
  return { hasKey: true, keyHint: `${prefix}...${tail}` }
}

export interface AdminLlmSettings {
  providers: LlmProviderSetting[]
  pricing: LlmPricingRow[]
}

/**
 * Providers (com api_key mascarada) + linhas ativas de pricing. Lança em erro
 * de query (caller decide o status). Tabela ausente (pré-migração) borbulha
 * como erro — a UI mostra o estado "não migrado".
 */
export async function getAdminLlmSettings(): Promise<AdminLlmSettings> {
  const admin = createAdminClient()

  const [{ data: providerRows, error: providerErr }, { data: pricingRows, error: pricingErr }] =
    await Promise.all([
      admin
        .from('llm_provider_settings')
        .select('id, provider, api_key, model, is_active, updated_by, updated_at')
        .order('provider', { ascending: true }),
      admin
        .from('llm_pricing')
        .select(
          'id, provider, model, unit, input_usd_per_1m, output_usd_per_1m, usd_per_minute, effective_from, active',
        )
        .eq('active', true)
        .order('provider', { ascending: true })
        .order('model', { ascending: true }),
    ])

  if (providerErr) throw providerErr
  if (pricingErr) throw pricingErr

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

  return { providers, pricing }
}
