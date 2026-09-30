/**
 * gpt-6.1-sol e gpt-6-astra no catálogo de LLM.
 *
 *   - cadastrados (catálogo, whitelist, contexto, preço) SEM mudar o default
 *     de nenhum módulo nem o modelo do cron semanal;
 *   - o @ai-sdk/openai do projeto (3.0.30) aceita os ids — teste com o SDK
 *     REAL, capturando a requisição HTTP que ele montaria;
 *   - como o SDK não os reconhece como modelo de raciocínio pelo prefixo,
 *     withOpenAIReasoning liga forceReasoning: sem temperature, papel
 *     "developer".
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { PROVIDER_CATALOG, OPENAI_FORCE_REASONING_MODELS, contextWindowFor } from '@/lib/llm/catalog'
import { withOpenAIReasoning } from '@/lib/llm/reasoning'
import { PRICING_USD_PER_1M } from '@/lib/constants/llm'
import { VALID_MODELS, resolveOpenAIModelId } from '@/lib/openai'
import { WEEKLY_DEFAULT_MODEL, draftWeeklySuggestedScript } from '@/lib/script-intelligence/weekly-suggestion'

const NEW = ['gpt-6.1-sol', 'gpt-6-astra'] as const

describe('catálogo', () => {
  it('os dois ids estão no catálogo, na whitelist e com janela de contexto', () => {
    for (const id of NEW) {
      expect(PROVIDER_CATALOG.openai.models).toContain(id)
      expect(VALID_MODELS.has(id)).toBe(true)
      expect(resolveOpenAIModelId(id)).toBe(id) // sem fallback silencioso para gpt-4o
      expect(contextWindowFor('openai', id)).toBe(922_000)
    }
  })

  it('preço de referência conforme a página de pricing da OpenAI (standard, ≤ 272k)', () => {
    expect(PRICING_USD_PER_1M['gpt-6.1-sol']).toEqual({ input: 2, output: 10 })
    expect(PRICING_USD_PER_1M['gpt-6-astra']).toEqual({ input: 10, output: 50 })
    const seed = readFileSync('scripts/124_llm_pricing_gpt6_seed.sql', 'utf8')
    expect(seed).toMatch(/'gpt-6\.1-sol', 2\.00::numeric,\s+10\.00::numeric/)
    expect(seed).toMatch(/'gpt-6-astra', 10\.00::numeric, 50\.00::numeric/)
  })
})

describe('nenhum outro módulo muda de modelo', () => {
  it('os outros módulos não usam a constante do semanal', () => {
    // Só weekly-suggestion (e o preview, que a importa para exibir) referenciam WEEKLY_DEFAULT_MODEL.
    const analyze = readFileSync('lib/script-intelligence/analyze.ts', 'utf8')
    expect(analyze).not.toMatch(/WEEKLY_DEFAULT_MODEL|gpt-6/)
    expect(readFileSync('lib/services/scoring.ts', 'utf8')).not.toMatch(/WEEKLY_DEFAULT_MODEL|gpt-6/)
  })

  it('default do OpenAI continua gpt-4o e é o primeiro da lista', () => {
    expect(PROVIDER_CATALOG.openai.defaultModel).toBe('gpt-4o')
    expect(PROVIDER_CATALOG.openai.models[0]).toBe('gpt-4o')
    expect(resolveOpenAIModelId('')).toBe('gpt-4o')
  })

  it('a migration 124 só insere preço — não toca no modelo ativo nem nas configs de módulo', () => {
    const seed = readFileSync('scripts/124_llm_pricing_gpt6_seed.sql', 'utf8').replace(/--.*$/gm, '')
    expect(seed).toMatch(/INSERT INTO public\.llm_pricing/)
    expect(seed).not.toMatch(/llm_provider_settings|ai_module_configs|rubrics|UPDATE/i)
  })

  it('o cron semanal usa gpt-6.1-sol pela constante do módulo, sem escolher modelo na rota', () => {
    expect(WEEKLY_DEFAULT_MODEL).toBe('gpt-6.1-sol')
    const cron = readFileSync('app/api/cron/weekly-script-suggestion/route.ts', 'utf8')
    expect(cron).toContain('await generateWeeklySuggestedScript()')
    const gen = readFileSync('lib/script-intelligence/weekly-suggestion.ts', 'utf8')
    // generateWeeklySuggestedScript (o do cron) chama o draft sem `model`.
    const cronPath = gen.slice(gen.indexOf('export async function generateWeeklySuggestedScript'))
    expect(cronPath).toMatch(/draftWeeklySuggestedScript\(admin, \{\s*recordUsage: \{ orgId: null, ref: 'weekly-script-suggestion' \},\s*\}\)/)
  })

  it('modelo fora do catálogo no draft → erro, sem cair em outro modelo', async () => {
    const r = await draftWeeklySuggestedScript({} as never, { recordUsage: null, model: 'gpt-6-imaginario' })
    expect(r).toMatchObject({ ok: false, kind: 'error', error: 'Modelo fora do catálogo OpenAI: gpt-6-imaginario' })
  })
})

// ─── SDK real: o que ele mandaria para a OpenAI ──────────────────────────────

async function capture(modelId: string, wrap: boolean): Promise<{ url: string; body: Record<string, unknown> }> {
  let seen: { url: string; body: Record<string, unknown> } | null = null
  const provider = createOpenAI({
    apiKey: 'test-key',
    fetch: async (url, init) => {
      seen = { url: String(url), body: JSON.parse(String(init?.body)) }
      throw new Error('captured') // não sai rede
    },
  })
  const base = provider(modelId)
  const model = wrap ? withOpenAIReasoning(base, modelId) : base
  await generateText({ model, system: 'SYS', prompt: 'hi', temperature: 0.3, maxRetries: 0 }).catch(() => {})
  if (!seen) throw new Error('SDK não chegou a montar a requisição')
  return seen
}

describe('@ai-sdk/openai 3.0.30 aceita os ids', () => {
  for (const id of NEW) {
    it(`${id}: Responses API, id exato, sem temperature, system como developer`, async () => {
      expect(OPENAI_FORCE_REASONING_MODELS.has(id)).toBe(true)
      const { url, body } = await capture(id, true)
      expect(url).toMatch(/\/responses$/)
      expect(body.model).toBe(id)
      expect(body).not.toHaveProperty('temperature')
      const input = body.input as Array<{ role: string }>
      expect(input[0].role).toBe('developer')
    })
  }

  it('sem a marca, o SDK trataria como modelo comum (mandaria temperature) — por isso o wrap', async () => {
    const { body } = await capture('gpt-6.1-sol', false)
    expect(body.temperature).toBe(0.3)
  })

  it('modelo antigo passa intocado pelo wrap (mesmo objeto, temperature mantida)', async () => {
    const provider = createOpenAI({ apiKey: 'test-key' })
    const m = provider('gpt-4o')
    expect(withOpenAIReasoning(m, 'gpt-4o')).toBe(m)
    const { body } = await capture('gpt-4o', true)
    expect(body.temperature).toBe(0.3)
    expect((body.input as Array<{ role: string }>)[0].role).toBe('system')
  })
})
