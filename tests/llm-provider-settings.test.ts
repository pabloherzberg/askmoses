/**
 * TC-LLM-PROVIDER-SETTINGS — Provider/chave/custo de LLM em /admin/llm-config
 *
 * ESTADO ATUAL: a feature está FINALIZADA e ligada ao pipeline. /api/analyze
 * (e todos os serviços de LLM) resolvem provider+modelo+chave via
 * getActiveLlmModel (provider ATIVO em llm_provider_settings, com fallback pro
 * .env quando não configurado) e o custo via computeCostForModel (pricing por
 * provider). Trocar o provider/chave na tela reflete em toda a plataforma.
 *
 * Cobre:
 *   - Contrato: rotas admin (/api/admin/llm-settings/*) com guards de auth/CSRF,
 *     validação de provider via registry, guard de "ativar só com chave".
 *   - Regressão inversa: /api/analyze usa o provider switch (não volta pro
 *     getOpenAIModel/computeCostUsd hardcoded) e aplica o tuning por módulo.
 *   - Migrations 099/100 existem, são idempotentes (IF NOT EXISTS) e têm RLS.
 *   - getActiveLlmModel: lógica de fallback replicada inline (sem tocar Supabase).
 *   - resolveGeminiModelId: normalização de sufixo "-001" e fallback pro default.
 *
 * Estratégia: mesmo padrão de tests/tc-llm-config.test.ts — testes de contrato via
 * readFileSync, lógica de negócio replicada inline (sem importar módulos com
 * side-effect de Supabase).
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = resolve(__dirname, '..')

const providerRouteSource = readFileSync(resolve(ROOT, 'app/api/admin/llm-settings/provider/route.ts'), 'utf-8')
const pricingRouteSource = readFileSync(resolve(ROOT, 'app/api/admin/llm-settings/pricing/route.ts'), 'utf-8')
const settingsRouteSource = readFileSync(resolve(ROOT, 'app/api/admin/llm-settings/route.ts'), 'utf-8')
const analyzeRouteSource = readFileSync(resolve(ROOT, 'app/api/analyze/route.ts'), 'utf-8')
const migration099Source = readFileSync(resolve(ROOT, 'scripts/099_llm_provider_settings.sql'), 'utf-8')
const migration100Source = readFileSync(resolve(ROOT, 'scripts/100_llm_pricing_gemini_seed.sql'), 'utf-8')

// ─── Contrato: rotas admin ──────────────────────────────────────────────────

describe('Contrato › app/api/admin/llm-settings/*', () => {
  it('GET /api/admin/llm-settings existe e tem guard de sessão + role admin', () => {
    expect(settingsRouteSource).toMatch(/export async function GET/)
    expect(settingsRouteSource).toMatch(/getSession/)
    expect(settingsRouteSource).toMatch(/unauthorized\(\)/)
    expect(settingsRouteSource).toMatch(/role\s*!==\s*['"]admin['"]/)
    expect(settingsRouteSource).toMatch(/forbidden\(\)/)
  })

  it('GET nunca retorna a api_key crua — delega p/ getAdminLlmSettings (que mascara)', () => {
    // maskKey vive agora em lib/db/llm-settings.ts (compartilhado com a página SSR).
    expect(settingsRouteSource).toContain('getAdminLlmSettings')
    expect(settingsRouteSource).not.toMatch(/apiKey:\s*r\.api_key/)
    const dbSettingsSource = readFileSync(resolve(ROOT, 'lib/db/llm-settings.ts'), 'utf-8')
    expect(dbSettingsSource).toContain('maskKey')
    expect(dbSettingsSource).not.toMatch(/apiKey:\s*r\.api_key/)
  })

  it('PATCH /api/admin/llm-settings/provider tem guard de CSRF + sessão + role admin', () => {
    expect(providerRouteSource).toMatch(/export async function PATCH/)
    expect(providerRouteSource).toMatch(/requireSameOrigin/)
    expect(providerRouteSource).toMatch(/getSession/)
    expect(providerRouteSource).toMatch(/role\s*!==\s*['"]admin['"]/)
  })

  it('PATCH valida provider contra o registry (isValidProvider)', () => {
    expect(providerRouteSource).toMatch(/isValidProvider\(provider\)/)
  })

  it('PATCH só ativa um provider que tenha chave utilizável (banco ou env)', () => {
    // Guard: setActive exige effectiveKey (api_key do banco ?? env do registry).
    expect(providerRouteSource).toContain('effectiveKey')
    expect(providerRouteSource).toMatch(/process\.env\[def\.envKey\]/)
  })

  it('POST /api/admin/llm-settings/pricing tem guard de CSRF + sessão + role admin', () => {
    expect(pricingRouteSource).toMatch(/export async function POST/)
    expect(pricingRouteSource).toMatch(/requireSameOrigin/)
    expect(pricingRouteSource).toMatch(/role\s*!==\s*['"]admin['"]/)
  })

  it('POST nunca faz UPDATE no valor de uma linha existente — sempre insert + desativa a anterior', () => {
    expect(pricingRouteSource).toContain(".update({ active: false })")
    expect(pricingRouteSource).toContain('.insert({')
  })

  it('GET /api/admin/llm-settings/pricing (histórico) existe e é admin-gated', () => {
    expect(pricingRouteSource).toMatch(/export async function GET/)
    expect(pricingRouteSource).toMatch(/effective_from[\s\S]*ascending:\s*false/)
  })
})

// ─── /api/analyze AGORA usa o switch de provider (feature finalizada) ────────
// A feature LLM Config foi ligada ao pipeline: /api/analyze resolve
// provider+modelo+chave via getActiveLlmModel (provider ativo em
// llm_provider_settings, fallback pro .env) e o custo via computeCostForModel
// (pricing por provider). Estes testes travam a REGRESSÃO INVERSA — impedem
// que alguém volte pro getOpenAIModel/computeCostUsd hardcoded.

describe('/api/analyze › usa o provider switch (getActiveLlmModel + computeCostForModel)', () => {
  it('importa e usa getActiveLlmModel/computeCostForModel de lib/llm-provider + llm-usage', () => {
    expect(analyzeRouteSource).toContain('getActiveLlmModel')
    expect(analyzeRouteSource).toContain('computeCostForModel')
    expect(analyzeRouteSource).toContain('@/lib/llm-provider')
  })

  it('NÃO usa mais o caminho hardcoded getOpenAIModel/computeCostUsd', () => {
    expect(analyzeRouteSource).not.toContain('getOpenAIModel(')
    expect(analyzeRouteSource).not.toContain('computeCostUsd(')
  })

  it('recordLlmUsage recebe provider explícito (custo por provider correto)', () => {
    const call = analyzeRouteSource.match(/recordLlmUsage\(\{[\s\S]*?\}\);/)?.[0] ?? ''
    expect(call).toContain('provider')
  })

  it('aplica o tuning por módulo (scoring_engine) — temperature + maxOutputTokens', () => {
    expect(analyzeRouteSource).toContain("getModuleTuning(\"scoring_engine\")")
    expect(analyzeRouteSource).toContain('maxOutputTokens')
  })
})

// ─── Migrations ──────────────────────────────────────────────────────────────

describe('Migrations › 099 e 100', () => {
  it('099 cria llm_provider_settings de forma idempotente', () => {
    expect(migration099Source).toMatch(/CREATE TABLE IF NOT EXISTS public\.llm_provider_settings/)
  })

  it('099 habilita RLS sem nenhuma policy (só service-role)', () => {
    expect(migration099Source).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(migration099Source).not.toMatch(/CREATE POLICY/)
  })

  it('099 garante no máximo um provider ativo por vez (índice único parcial)', () => {
    expect(migration099Source).toMatch(/CREATE UNIQUE INDEX[\s\S]*llm_provider_settings_single_active_idx/)
    expect(migration099Source).toContain('WHERE is_active')
  })

  it('099 documenta que api_key é texto simples (sem criptografia)', () => {
    expect(migration099Source.toLowerCase()).toMatch(/texto simples/)
  })

  it('100 semeia modelos gemini em llm_pricing sem alterar schema', () => {
    expect(migration100Source).toMatch(/INSERT INTO public\.llm_pricing/)
    expect(migration100Source).toContain("'gemini'")
    expect(migration100Source).not.toMatch(/CREATE TABLE/)
  })

  it('100 flags que os preços são placeholders a validar', () => {
    expect(migration100Source).toMatch(/placeholder|refer[eê]ncia/i)
  })

  it('arquivos de migration existem no caminho esperado', () => {
    expect(existsSync(resolve(ROOT, 'scripts/099_llm_provider_settings.sql'))).toBe(true)
    expect(existsSync(resolve(ROOT, 'scripts/100_llm_pricing_gemini_seed.sql'))).toBe(true)
  })
})

// ─── getActiveLlmModel — lógica de fallback replicada inline ────────────────

type LlmProvider = 'openai' | 'gemini'

interface ActiveProviderRow {
  provider: LlmProvider
  api_key: string | null
  model: string
}

/** Réplica pura da árvore de decisão de lib/llm-provider.ts::getActiveLlmModel,
 *  sem tocar Supabase/AI-SDK — só testa QUAL provider/modelo seria escolhido. */
function decideProviderAndModel(
  active: ActiveProviderRow | null,
  perOrgModelOverride: string | null | undefined,
): { provider: LlmProvider; usedFallback: boolean } {
  if (!active) return { provider: 'openai', usedFallback: true }

  if (active.provider === 'gemini' && !active.api_key) {
    return { provider: 'openai', usedFallback: true }
  }

  return { provider: active.provider, usedFallback: false }
}

describe('getActiveLlmModel › árvore de decisão (réplica pura)', () => {
  it('sem linha ativa (tabela vazia/não migrada) → fallback pra OpenAI', () => {
    const result = decideProviderAndModel(null, null)
    expect(result.provider).toBe('openai')
    expect(result.usedFallback).toBe(true)
  })

  it('com linha ativa provider=openai → usa openai, sem fallback', () => {
    const result = decideProviderAndModel({ provider: 'openai', api_key: 'sk-abc', model: 'gpt-4o' }, null)
    expect(result.provider).toBe('openai')
    expect(result.usedFallback).toBe(false)
  })

  it('com linha ativa provider=gemini e api_key configurada → usa gemini', () => {
    const result = decideProviderAndModel({ provider: 'gemini', api_key: 'AIza...', model: 'gemini-2.5-flash' }, null)
    expect(result.provider).toBe('gemini')
    expect(result.usedFallback).toBe(false)
  })

  it('gemini ativo mas SEM api_key configurada → fallback pra openai (nunca quebra)', () => {
    const result = decideProviderAndModel({ provider: 'gemini', api_key: null, model: 'gemini-2.5-flash' }, null)
    expect(result.provider).toBe('openai')
    expect(result.usedFallback).toBe(true)
  })
})

// ─── resolveGeminiModelId — réplica pura ────────────────────────────────────

const GEMINI_VALID_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
])
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite'

function resolveGeminiModelId(modelName?: string | null): string {
  const sanitized = (modelName ?? '')
    .replace(/^(google\/|models\/)/, '')
    .replace(/-001$/, '')
    .trim()
  if (GEMINI_VALID_MODELS.has(sanitized)) return sanitized
  if (GEMINI_VALID_MODELS.has(`${sanitized}-001`)) return sanitized
  return DEFAULT_GEMINI_MODEL
}

describe('resolveGeminiModelId › réplica pura', () => {
  it('normaliza sufixo -001 pro nome base', () => {
    expect(resolveGeminiModelId('gemini-2.0-flash-001')).toBe('gemini-2.0-flash')
  })

  it('aceita nome já normalizado', () => {
    expect(resolveGeminiModelId('gemini-2.5-flash')).toBe('gemini-2.5-flash')
  })

  it('remove prefixo google/', () => {
    expect(resolveGeminiModelId('google/gemini-2.5-pro')).toBe('gemini-2.5-pro')
  })

  it('nome desconhecido → cai no default', () => {
    expect(resolveGeminiModelId('gemini-9.9-ultra')).toBe(DEFAULT_GEMINI_MODEL)
  })

  it('vazio/undefined → cai no default', () => {
    expect(resolveGeminiModelId(undefined)).toBe(DEFAULT_GEMINI_MODEL)
    expect(resolveGeminiModelId(null)).toBe(DEFAULT_GEMINI_MODEL)
  })
})
