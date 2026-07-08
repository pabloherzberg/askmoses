import type { LanguageModel } from 'ai'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LlmProvider } from '@/lib/types'
import {
  DEFAULT_PROVIDER,
  getProviderDef,
  isValidProvider,
  type ProviderDef,
} from '@/lib/llm/registry'

/**
 * Resolve um nome cru de modelo Gemini → id canônico (remove sufixo "-001" e
 * prefixos google//models/). Mantido exportado por compatibilidade; delega ao
 * registry (fonte única de verdade).
 */
export function resolveGeminiModelId(modelName?: string | null): string {
  return getProviderDef('gemini')!.resolveModelId(modelName)
}

interface ProviderRow {
  provider: LlmProvider
  api_key: string | null
  model: string
  is_active: boolean
}

// ─── Cache das linhas de llm_provider_settings ────────────────────────────────
// Sobrevive a HMR via Symbol no globalThis (mesmo padrão de llm-usage.ts).
// TTL de 5min: trocar provider/chave na tela reflete no pipeline em até 5min.

interface ProviderCacheState {
  rows: ProviderRow[] | null // null = tabela não migrada / query falhou
  expiresAt: number
}
const CACHE_TTL_MS = 5 * 60 * 1000
const cacheKey_ = Symbol.for('askmoses.llmprovider.settings')
type GlobalWithCache = typeof globalThis & { [cacheKey_]?: ProviderCacheState }
const gp = globalThis as GlobalWithCache

/**
 * Carrega (com cache de 5min) TODAS as linhas de llm_provider_settings.
 * Never throws — falha de query / tabela ausente (pré-migração) resolve p/
 * `null`, que os callers tratam como "sem override, usa fallback env".
 */
async function getProviderRows(): Promise<ProviderRow[] | null> {
  const cached = gp[cacheKey_]
  if (cached && cached.expiresAt > Date.now()) return cached.rows

  let rows: ProviderRow[] | null = null
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('llm_provider_settings')
      .select('provider, api_key, model, is_active')
    if (error) throw error
    rows = (data as ProviderRow[] | null) ?? []
  } catch (err) {
    console.warn(
      '[llm-provider] failed to load provider settings (falling back to env):',
      err,
    )
    rows = null
  }

  gp[cacheKey_] = { rows, expiresAt: Date.now() + CACHE_TTL_MS }
  return rows
}

function getActiveRow(rows: ProviderRow[] | null): ProviderRow | null {
  if (!rows) return null
  return rows.find((r) => r.is_active && isValidProvider(r.provider)) ?? null
}

export interface ResolvedLlmModel {
  model: LanguageModel
  provider: LlmProvider
  modelId: string
}

/**
 * Resolve QUAL provider+modelo+chave o pipeline deve chamar nesta request.
 * `perOrgModelOverride` é o `rubrics.llm_model` (ex.: "openai/gpt-4o",
 * "google/gemini-2.5-flash").
 *
 * Regra: o provider ATIVO (llm_provider_settings.is_active) decide QUAL
 * provider roda. O override por-rubrica só escolhe o MODELO dentro desse
 * provider — e só quando pertence a ele; um override de outro provider é
 * ignorado em favor do modelo configurado na linha ativa. Isso evita quebrar
 * orgs quando o admin troca o provider global.
 *
 * Sem linha ativa (tabela vazia / não migrada / query falhou) → fallback pro
 * DEFAULT_PROVIDER usando a chave da env — byte-idêntico ao comportamento
 * hardcoded anterior a esta feature.
 */
export async function getActiveLlmModel(
  perOrgModelOverride?: string | null,
): Promise<ResolvedLlmModel> {
  const rows = await getProviderRows()
  const active = getActiveRow(rows)

  // Sem provider ativo → default provider via env.
  if (!active) {
    return buildModel(getProviderDef(DEFAULT_PROVIDER)!, null, perOrgModelOverride)
  }

  const def = getProviderDef(active.provider)
  // Provider ativo não está no registry (ex.: linha órfã após rollback) → default.
  if (!def) {
    return buildModel(getProviderDef(DEFAULT_PROVIDER)!, null, perOrgModelOverride)
  }

  // Provider ativo sem chave (nem no banco, nem na env) → fallback pro default
  // provider, pra nunca quebrar o pipeline por config incompleta.
  const key = active.api_key ?? process.env[def.envKey] ?? null
  if (!key) {
    console.warn(
      `[llm-provider] provider ativo "${def.id}" sem chave (banco/env) — fallback pro ${DEFAULT_PROVIDER}.`,
    )
    return buildModel(getProviderDef(DEFAULT_PROVIDER)!, null, perOrgModelOverride)
  }

  return buildModel(def, active.api_key, perOrgModelOverride, active.model)
}

function buildModel(
  def: ProviderDef,
  apiKey: string | null,
  perOrgModelOverride: string | null | undefined,
  activeModel?: string,
): ResolvedLlmModel {
  // Override só vale se pertence a ESTE provider; senão usa o modelo
  // configurado na linha ativa (ou o default do provider).
  const preferred = def.ownsModel(perOrgModelOverride)
    ? perOrgModelOverride
    : (activeModel ?? def.defaultModel)
  const modelId = def.resolveModelId(preferred)
  return { model: def.makeModel(apiKey, modelId), provider: def.id, modelId }
}

/**
 * Resolve a chave de API de um provider específico: a do banco
 * (llm_provider_settings) OU a env (envKey do registry) como fallback.
 *
 * Usado por serviços presos a um provider (ex.: transcrição de áudio no
 * Whisper, que é OpenAI-only) — assim, adicionar uma chave OpenAI no banco
 * passa a valer inclusive fora do switch de provider ativo. Never throws:
 * retorna null se não houver chave em lugar nenhum (caller decide o erro).
 */
export async function getProviderApiKey(provider: LlmProvider): Promise<string | null> {
  const def = getProviderDef(provider)
  const envKey = def?.envKey
  const rows = await getProviderRows()
  const row = rows?.find((r) => r.provider === provider) ?? null
  return row?.api_key ?? (envKey ? process.env[envKey] ?? null : null)
}
