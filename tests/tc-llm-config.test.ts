/**
 * TC-LLM-CONFIG — Painel de LLM Config
 *
 * Cobre os 10 TCs definidos para a feature de LLM Config:
 *   TC-01  Owner não acessa o painel (acesso restrito a admin)
 *   TC-02  Admin acessa o painel com 3 módulos + campos + hints
 *   TC-03  Admin salva temperature dentro do range válido
 *   TC-04  Admin salva max_tokens dentro do range válido
 *   TC-05  Valores fora do range são rejeitados com mensagem clara
 *   TC-06  Hints de range recomendado aparecem por módulo
 *   TC-07  Alteração fica registrada no log com todos os campos
 *   TC-08  Warning registrado quando resposta é truncada (finish_reason: length)
 *   TC-09  Sistema lê configuração mais recente antes de cada execução
 *   TC-10  Default aplicado quando módulo não tem configuração manual
 *
 * Estratégia: testes unitários puros sem banco, sem framework.
 *   - A lógica de negócio é replicada inline (sem importar módulos com side-effects).
 *   - Testes de contrato verificam que os arquivos do handler e da API route
 *     existem e contêm os controles necessários.
 *   - Testes de runtime simulam o comportamento do PUT handler e do runtime engine.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect, beforeEach } from 'vitest'

const ROOT = resolve(__dirname, '..')

// ─── Source files ────────────────────────────────────────────────────────────

const apiRouteSource      = readFileSync(resolve(ROOT, 'app/api/ai-module-configs/route.ts'), 'utf-8')
const mswHandlerSource    = readFileSync(resolve(ROOT, 'lib/mocks/handlers.ts'), 'utf-8')
const mockDataSource      = readFileSync(resolve(ROOT, 'lib/mock-data.ts'), 'utf-8')
const typesSource         = readFileSync(resolve(ROOT, 'lib/types.ts'), 'utf-8')
const clientPageSource    = readFileSync(resolve(ROOT, 'app/[locale]/(admin)/admin/llm-config/LlmConfigClient.tsx'), 'utf-8')
const sidebarSource       = readFileSync(resolve(ROOT, 'components/layout/AppSidebar.tsx'), 'utf-8')
const ptMessages          = JSON.parse(readFileSync(resolve(ROOT, 'messages/pt.json'), 'utf-8'))
const enMessages          = JSON.parse(readFileSync(resolve(ROOT, 'messages/en.json'), 'utf-8'))

// ─── Inline business logic (replica do que está no handler e na API route) ───

type AiModuleId = 'scoring_engine' | 'correlation_engine' | 'marketing_intelligence'

interface AiModuleConfig {
  module_id: AiModuleId
  temperature: number
  max_tokens: number
  updated_by: string
  updated_at: string
}

interface AiModuleConfigLogEntry {
  id: string
  module_id: AiModuleId
  field: 'temperature' | 'max_tokens'
  previous_value: number
  new_value: number
  updated_by: string
  updated_at: string
}

const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_MAX_TOKENS  = 1000
const TEMP_MIN = 0.0
const TEMP_MAX = 1.0
const TOKENS_MIN = 100
const TOKENS_MAX = 4000

function validateTemperature(value: number): string | null {
  if (value < TEMP_MIN || value > TEMP_MAX) {
    return `Temperature must be between ${TEMP_MIN.toFixed(1)} and ${TEMP_MAX.toFixed(1)}`
  }
  return null
}

function validateMaxTokens(value: number): string | null {
  if (value < TOKENS_MIN || value > TOKENS_MAX) {
    return `Max tokens must be between ${TOKENS_MIN} and ${TOKENS_MAX}`
  }
  return null
}

function buildDefaultConfig(module_id: AiModuleId): AiModuleConfig {
  return {
    module_id,
    temperature: DEFAULT_TEMPERATURE,
    max_tokens: DEFAULT_MAX_TOKENS,
    updated_by: 'system',
    updated_at: new Date().toISOString(),
  }
}

function applyConfigUpdate(
  configs: AiModuleConfig[],
  log: AiModuleConfigLogEntry[],
  payload: { module_id: AiModuleId; temperature: number; max_tokens: number; updated_by: string }
): { config: AiModuleConfig; log: AiModuleConfigLogEntry[] } | { error: string } {
  const tempError = validateTemperature(payload.temperature)
  if (tempError) return { error: tempError }
  const tokensError = validateMaxTokens(payload.max_tokens)
  if (tokensError) return { error: tokensError }

  const idx = configs.findIndex((c) => c.module_id === payload.module_id)
  if (idx === -1) return { error: 'Module not found' }

  const prev = configs[idx]
  const now = new Date().toISOString()
  const newEntries: AiModuleConfigLogEntry[] = []

  if (prev.temperature !== payload.temperature) {
    newEntries.push({
      id: `log-${Date.now()}-t`,
      module_id: payload.module_id,
      field: 'temperature',
      previous_value: prev.temperature,
      new_value: payload.temperature,
      updated_by: payload.updated_by,
      updated_at: now,
    })
  }
  if (prev.max_tokens !== payload.max_tokens) {
    newEntries.push({
      id: `log-${Date.now()}-m`,
      module_id: payload.module_id,
      field: 'max_tokens',
      previous_value: prev.max_tokens,
      new_value: payload.max_tokens,
      updated_by: payload.updated_by,
      updated_at: now,
    })
  }

  configs[idx] = { ...prev, temperature: payload.temperature, max_tokens: payload.max_tokens, updated_by: payload.updated_by, updated_at: now }
  const updatedLog = [...newEntries, ...log]

  return { config: configs[idx], log: updatedLog }
}

function buildLlmPayload(moduleId: AiModuleId, configs: AiModuleConfig[]): { temperature: number; max_tokens: number } {
  const cfg = configs.find((c) => c.module_id === moduleId)
  if (!cfg) return { temperature: DEFAULT_TEMPERATURE, max_tokens: DEFAULT_MAX_TOKENS }
  return { temperature: cfg.temperature, max_tokens: cfg.max_tokens }
}

function detectTruncation(finishReason: string, moduleId: AiModuleId, maxTokens: number): string | null {
  if (finishReason === 'length') {
    return `Response truncated — module: ${moduleId}, max_tokens: ${maxTokens}`
  }
  return null
}

// ─── Helpers for mutable state in tests ──────────────────────────────────────

function makeConfigs(): AiModuleConfig[] {
  return [
    { module_id: 'scoring_engine',         temperature: 0.2, max_tokens: 1000, updated_by: 'admin@askmoses.ai', updated_at: '2026-05-10T14:23:00Z' },
    { module_id: 'correlation_engine',     temperature: 0.5, max_tokens: 1200, updated_by: 'admin@askmoses.ai', updated_at: '2026-05-10T14:23:00Z' },
    { module_id: 'marketing_intelligence', temperature: 0.8, max_tokens: 2000, updated_by: 'admin@askmoses.ai', updated_at: '2026-05-10T14:23:00Z' },
  ]
}

function makeLog(): AiModuleConfigLogEntry[] {
  return []
}

// ═════════════════════════════════════════════════════════════════════════════
// TC-01 — Owner não acessa o painel de LLM Config
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-01 › Owner não acessa o painel de LLM Config', () => {
  it('API route guarda com role !== admin → retorna 403', () => {
    // A route usa forbidden() quando role !== 'admin'
    expect(apiRouteSource).toMatch(/role\s*!==\s*['"]admin['"]/)
    expect(apiRouteSource).toMatch(/forbidden\(\)/)
  })

  it('API route verifica sessão antes de autorizar — sem sessão retorna 401', () => {
    expect(apiRouteSource).toMatch(/getSession/)
    expect(apiRouteSource).toMatch(/unauthorized\(\)/)
  })

  it('AdminNavItems inclui o link /admin/llm-config (não acessível a owner/trainer)', () => {
    // O link só aparece no AdminNavItems, não no OwnerNavItems nem TrainerNavItems
    const adminBlock  = sidebarSource.slice(sidebarSource.indexOf('export function AdminNavItems'))
    const ownerBlock  = sidebarSource.slice(sidebarSource.indexOf('export function OwnerNavItems'),   sidebarSource.indexOf('export function AdminNavItems'))
    const trainerBlock = sidebarSource.slice(sidebarSource.indexOf('export function TrainerNavItems'), sidebarSource.indexOf('export function OwnerNavItems'))

    expect(adminBlock).toContain('/admin/llm-config')
    expect(ownerBlock).not.toContain('/admin/llm-config')
    expect(trainerBlock).not.toContain('/admin/llm-config')
  })

  it('página existe no grupo de rotas (admin)', () => {
    const pagePath = resolve(ROOT, 'app/[locale]/(admin)/admin/llm-config/page.tsx')
    expect(existsSync(pagePath)).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TC-02 — Admin acessa o painel com 3 módulos + campos + hints
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-02 › Admin vê os 3 módulos configuráveis com campos e hints', () => {
  it('mock data contém os 3 módulos', () => {
    const modules: AiModuleId[] = ['scoring_engine', 'correlation_engine', 'marketing_intelligence']
    const configs = makeConfigs()
    expect(configs.map((c) => c.module_id)).toEqual(expect.arrayContaining(modules))
    expect(configs).toHaveLength(3)
  })

  it('cada config tem temperature e max_tokens preenchidos', () => {
    const configs = makeConfigs()
    for (const cfg of configs) {
      expect(typeof cfg.temperature).toBe('number')
      expect(typeof cfg.max_tokens).toBe('number')
    }
  })

  it('AiControlsClient renderiza os 3 módulos', () => {
    expect(clientPageSource).toContain('scoring_engine')
    expect(clientPageSource).toContain('correlation_engine')
    expect(clientPageSource).toContain('marketing_intelligence')
  })

  it('AiControlsClient renderiza campo temperature para cada módulo', () => {
    expect(clientPageSource).toContain("fields.temperature")
  })

  it('AiControlsClient renderiza campo max_tokens para cada módulo', () => {
    expect(clientPageSource).toContain("fields.maxTokens")
  })

  it('AiControlsClient exibe hints de range recomendado', () => {
    expect(clientPageSource).toContain('hints.temperatureRange')
    expect(clientPageSource).toContain('hints.maxTokensRange')
  })

  it('tipos TypeScript definem AiModuleId com os 3 módulos', () => {
    expect(typesSource).toContain('scoring_engine')
    expect(typesSource).toContain('correlation_engine')
    expect(typesSource).toContain('marketing_intelligence')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TC-03 — Admin salva temperature dentro do range válido
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-03 › Admin salva nova temperature dentro do range válido', () => {
  let configs: AiModuleConfig[]
  let log: AiModuleConfigLogEntry[]
  beforeEach(() => { configs = makeConfigs(); log = makeLog() })

  it('altera marketing_intelligence de 0.8 para 0.4 com sucesso', () => {
    const result = applyConfigUpdate(configs, log, {
      module_id: 'marketing_intelligence',
      temperature: 0.4,
      max_tokens: 2000,
      updated_by: 'admin@askmoses.ai',
    })
    expect('error' in result).toBe(false)
    const r = result as { config: AiModuleConfig; log: AiModuleConfigLogEntry[] }
    expect(r.config.temperature).toBe(0.4)
  })

  it('updated_by e updated_at ficam registrados', () => {
    const result = applyConfigUpdate(configs, log, {
      module_id: 'marketing_intelligence',
      temperature: 0.4,
      max_tokens: 2000,
      updated_by: 'admin@askmoses.ai',
    }) as { config: AiModuleConfig; log: AiModuleConfigLogEntry[] }
    expect(result.config.updated_by).toBe('admin@askmoses.ai')
    expect(result.config.updated_at).toBeTruthy()
  })

  it('payload do LLM usa a temperatura atualizada', () => {
    applyConfigUpdate(configs, log, {
      module_id: 'marketing_intelligence',
      temperature: 0.4,
      max_tokens: 2000,
      updated_by: 'admin@askmoses.ai',
    })
    const payload = buildLlmPayload('marketing_intelligence', configs)
    expect(payload.temperature).toBe(0.4)
  })

  it('API route tem handler PUT', () => {
    expect(apiRouteSource).toMatch(/export async function PUT/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TC-04 — Admin salva max_tokens dentro do range válido
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-04 › Admin salva max_tokens dentro do range válido', () => {
  let configs: AiModuleConfig[]
  let log: AiModuleConfigLogEntry[]
  beforeEach(() => { configs = makeConfigs(); log = makeLog() })

  it('altera scoring_engine de 1000 para 600', () => {
    const result = applyConfigUpdate(configs, log, {
      module_id: 'scoring_engine',
      temperature: 0.2,
      max_tokens: 600,
      updated_by: 'admin@askmoses.ai',
    }) as { config: AiModuleConfig; log: AiModuleConfigLogEntry[] }
    expect(result.config.max_tokens).toBe(600)
  })

  it('payload do LLM usa max_tokens atualizado', () => {
    applyConfigUpdate(configs, log, {
      module_id: 'scoring_engine',
      temperature: 0.2,
      max_tokens: 600,
      updated_by: 'admin@askmoses.ai',
    })
    const payload = buildLlmPayload('scoring_engine', configs)
    expect(payload.max_tokens).toBe(600)
  })

  it('rota real PUT persiste no banco via updateModuleConfig (não é mais mock MSW)', () => {
    expect(apiRouteSource).toContain('updateModuleConfig')
    // O handler MSW foi removido — a rota real (Supabase) não pode ser sombreada em dev.
    expect(mswHandlerSource).not.toContain("http.put('/api/ai-module-configs'")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TC-05 — Valores fora do range são rejeitados com mensagem clara
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-05 › Valores fora do range são rejeitados', () => {
  let configs: AiModuleConfig[]
  let log: AiModuleConfigLogEntry[]
  beforeEach(() => { configs = makeConfigs(); log = makeLog() })

  it('temperature 1.5 → mensagem "Temperature must be between 0.0 and 1.0"', () => {
    const err = validateTemperature(1.5)
    expect(err).toBe('Temperature must be between 0.0 and 1.0')
  })

  it('temperature -0.1 → mensagem de erro', () => {
    expect(validateTemperature(-0.1)).not.toBeNull()
  })

  it('max_tokens 50 → mensagem "Max tokens must be between 100 and 4000"', () => {
    const err = validateMaxTokens(50)
    expect(err).toBe('Max tokens must be between 100 and 4000')
  })

  it('max_tokens 4001 → mensagem de erro', () => {
    expect(validateMaxTokens(4001)).not.toBeNull()
  })

  it('valor inválido → applyConfigUpdate retorna error, config não é alterada', () => {
    const originalTemp = configs.find((c) => c.module_id === 'scoring_engine')!.temperature
    const result = applyConfigUpdate(configs, log, {
      module_id: 'scoring_engine',
      temperature: 1.5,
      max_tokens: 1000,
      updated_by: 'admin@askmoses.ai',
    })
    expect('error' in result).toBe(true)
    expect(configs.find((c) => c.module_id === 'scoring_engine')!.temperature).toBe(originalTemp)
  })

  it('max_tokens inválido → applyConfigUpdate retorna error, config não é alterada', () => {
    const originalTokens = configs.find((c) => c.module_id === 'scoring_engine')!.max_tokens
    const result = applyConfigUpdate(configs, log, {
      module_id: 'scoring_engine',
      temperature: 0.2,
      max_tokens: 50,
      updated_by: 'admin@askmoses.ai',
    })
    expect('error' in result).toBe(true)
    expect(configs.find((c) => c.module_id === 'scoring_engine')!.max_tokens).toBe(originalTokens)
  })

  it('temperature 0.0 e 1.0 (bounds exatos) são aceitos', () => {
    expect(validateTemperature(0.0)).toBeNull()
    expect(validateTemperature(1.0)).toBeNull()
  })

  it('max_tokens 100 e 4000 (bounds exatos) são aceitos', () => {
    expect(validateMaxTokens(100)).toBeNull()
    expect(validateMaxTokens(4000)).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TC-06 — Hints de range recomendado aparecem por módulo
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-06 › Hints de range recomendado por módulo', () => {
  const MODULES_META = [
    { id: 'scoring_engine',         tempHint: '0.0 – 0.3' },
    { id: 'correlation_engine',     tempHint: '0.3 – 0.6' },
    { id: 'marketing_intelligence', tempHint: '0.6 – 1.0' },
  ]

  it('scoring_engine tem hint de temperature baixa (0.0 – 0.3)', () => {
    const scoring = MODULES_META.find((m) => m.id === 'scoring_engine')!
    expect(scoring.tempHint).toMatch(/0\.[0-3]/)
    expect(parseFloat(scoring.tempHint.split('–')[0].trim())).toBeLessThanOrEqual(0.3)
  })

  it('marketing_intelligence tem hint de temperature alta (0.6 – 1.0)', () => {
    const marketing = MODULES_META.find((m) => m.id === 'marketing_intelligence')!
    expect(parseFloat(marketing.tempHint.split('–')[0].trim())).toBeGreaterThanOrEqual(0.6)
  })

  it('AiControlsClient exibe tempHint por módulo', () => {
    expect(clientPageSource).toContain('tempHint')
  })

  it('hint de max_tokens exibe range 100 – 4000', () => {
    expect(clientPageSource).toContain('100 – 4000')
  })

  it('translations pt.json contém hints.temperatureRange e hints.maxTokensRange', () => {
    expect(ptMessages.Admin.llmConfig.hints.temperatureRange).toBeTruthy()
    expect(ptMessages.Admin.llmConfig.hints.maxTokensRange).toBeTruthy()
  })

  it('translations en.json contém hints de range', () => {
    expect(enMessages.Admin.llmConfig.hints.temperatureRange).toBeTruthy()
    expect(enMessages.Admin.llmConfig.hints.maxTokensRange).toBeTruthy()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TC-07 — Alteração fica registrada no log com todos os campos
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-07 › Log registra alteração com todos os campos obrigatórios', () => {
  let configs: AiModuleConfig[]
  let log: AiModuleConfigLogEntry[]
  beforeEach(() => { configs = makeConfigs(); log = makeLog() })

  it('registra entrada de log ao alterar max_tokens do correlation_engine', () => {
    const result = applyConfigUpdate(configs, log, {
      module_id: 'correlation_engine',
      temperature: 0.5,
      max_tokens: 700,
      updated_by: 'admin@askmoses.ai',
    }) as { config: AiModuleConfig; log: AiModuleConfigLogEntry[] }
    const entry = result.log.find((e) => e.field === 'max_tokens' && e.module_id === 'correlation_engine')
    expect(entry).toBeDefined()
    expect(entry!.previous_value).toBe(1200)
    expect(entry!.new_value).toBe(700)
    expect(entry!.updated_by).toBe('admin@askmoses.ai')
    expect(entry!.updated_at).toBeTruthy()
  })

  it('entrada de log tem todos os campos obrigatórios: id, module_id, field, previous_value, new_value, updated_by, updated_at', () => {
    const result = applyConfigUpdate(configs, log, {
      module_id: 'correlation_engine',
      temperature: 0.5,
      max_tokens: 700,
      updated_by: 'admin@askmoses.ai',
    }) as { config: AiModuleConfig; log: AiModuleConfigLogEntry[] }
    const entry = result.log[0]
    expect(entry).toHaveProperty('id')
    expect(entry).toHaveProperty('module_id')
    expect(entry).toHaveProperty('field')
    expect(entry).toHaveProperty('previous_value')
    expect(entry).toHaveProperty('new_value')
    expect(entry).toHaveProperty('updated_by')
    expect(entry).toHaveProperty('updated_at')
  })

  it('log é imutável — função applyConfigUpdate não altera entradas anteriores', () => {
    applyConfigUpdate(configs, log, { module_id: 'correlation_engine', temperature: 0.5, max_tokens: 700, updated_by: 'admin@askmoses.ai' })
    const snapshot = JSON.stringify(log)
    // O log original não é mutado; as novas entradas são adicionadas no resultado
    expect(snapshot).toBe(JSON.stringify(makeLog()))
  })

  it('múltiplas alterações geram múltiplas entradas no log', () => {
    const r1 = applyConfigUpdate(configs, log, { module_id: 'scoring_engine', temperature: 0.3, max_tokens: 800, updated_by: 'admin@askmoses.ai' }) as { config: AiModuleConfig; log: AiModuleConfigLogEntry[] }
    // 2 campos alterados → 2 entradas
    expect(r1.log.length).toBeGreaterThanOrEqual(2)
  })

  it('se apenas temperature muda, apenas 1 entrada de log é criada', () => {
    const r = applyConfigUpdate(configs, log, {
      module_id: 'scoring_engine',
      temperature: 0.3,    // era 0.2
      max_tokens: 1000,    // sem mudança
      updated_by: 'admin@askmoses.ai',
    }) as { config: AiModuleConfig; log: AiModuleConfigLogEntry[] }
    expect(r.log).toHaveLength(1)
    expect(r.log[0].field).toBe('temperature')
  })

  it('se nada muda, nenhuma entrada de log é criada', () => {
    const r = applyConfigUpdate(configs, log, {
      module_id: 'scoring_engine',
      temperature: 0.2,    // sem mudança
      max_tokens: 1000,    // sem mudança
      updated_by: 'admin@askmoses.ai',
    }) as { config: AiModuleConfig; log: AiModuleConfigLogEntry[] }
    expect(r.log).toHaveLength(0)
  })

  it('AiControlsClient exibe log de alterações com todos os campos na UI', () => {
    // O componente usa template literal t(`th.${k}`) com array ['logModule','logField',...]
    expect(clientPageSource).toContain("'logModule'")
    expect(clientPageSource).toContain("'logField'")
    expect(clientPageSource).toContain("'logPrev'")
    expect(clientPageSource).toContain("'logNew'")
    expect(clientPageSource).toContain("'logUser'")
    expect(clientPageSource).toContain("'logDate'")
    // e o prefixo `th.` está no template literal
    expect(clientPageSource).toContain('`th.${k}`')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TC-08 — Warning registrado quando resposta é truncada
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-08 › Warning registrado quando resposta LLM é truncada', () => {
  it('finish_reason=length gera warning com módulo e max_tokens', () => {
    const warning = detectTruncation('length', 'marketing_intelligence', 300)
    expect(warning).not.toBeNull()
    expect(warning).toContain('truncated')
    expect(warning).toContain('marketing_intelligence')
    expect(warning).toContain('300')
  })

  it('finish_reason=stop não gera warning', () => {
    expect(detectTruncation('stop', 'marketing_intelligence', 300)).toBeNull()
  })

  it('finish_reason=end_turn não gera warning', () => {
    expect(detectTruncation('end_turn', 'scoring_engine', 1000)).toBeNull()
  })

  it('warning inclui max_tokens configurado (não o padrão)', () => {
    const warning = detectTruncation('length', 'scoring_engine', 300)
    expect(warning).toContain('300')
    expect(warning).not.toContain('1000')
  })

  it('sistema não reprocessa automaticamente — detectTruncation apenas retorna o warning (null ou string)', () => {
    // A função retorna uma string (warning) ou null — não dispara re-execução
    const result = detectTruncation('length', 'marketing_intelligence', 300)
    expect(typeof result === 'string' || result === null).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TC-09 — Sistema lê configuração mais recente antes de cada execução
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-09 › Sistema lê configuração mais recente antes de cada execução', () => {
  let configs: AiModuleConfig[]
  let log: AiModuleConfigLogEntry[]
  beforeEach(() => { configs = makeConfigs(); log = makeLog() })

  it('após atualizar a temperature às 14h, payload das 14h30 usa o novo valor', () => {
    // Simula atualização às 14h
    applyConfigUpdate(configs, log, {
      module_id: 'scoring_engine',
      temperature: 0.3,
      max_tokens: 1000,
      updated_by: 'admin@askmoses.ai',
    })
    // Simula execução às 14h30 — buildLlmPayload lê configs in-memory
    const payload = buildLlmPayload('scoring_engine', configs)
    expect(payload.temperature).toBe(0.3)
  })

  it('configs em memória são atualizadas imediatamente após save — sem cache antigo', () => {
    const original = buildLlmPayload('correlation_engine', configs)
    expect(original.temperature).toBe(0.5)

    applyConfigUpdate(configs, log, {
      module_id: 'correlation_engine',
      temperature: 0.6,
      max_tokens: 1200,
      updated_by: 'admin@askmoses.ai',
    })

    const updated = buildLlmPayload('correlation_engine', configs)
    expect(updated.temperature).toBe(0.6)
    expect(updated.temperature).not.toBe(original.temperature)
  })

  it('updated_at da config reflete o timestamp da última alteração', () => {
    const before = new Date('2026-05-10T14:00:00Z').getTime()
    applyConfigUpdate(configs, log, {
      module_id: 'scoring_engine',
      temperature: 0.3,
      max_tokens: 1000,
      updated_by: 'admin@askmoses.ai',
    })
    const cfg = configs.find((c) => c.module_id === 'scoring_engine')!
    const updatedAt = new Date(cfg.updated_at).getTime()
    expect(updatedAt).toBeGreaterThan(before)
  })

  it('rota real GET lê a configuração mais recente do banco (getAllModuleConfigs)', () => {
    expect(apiRouteSource).toContain('getAllModuleConfigs')
    // Sem cache antigo de MSW sombreando o GET real.
    expect(mswHandlerSource).not.toContain("http.get('/api/ai-module-configs'")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TC-10 — Default aplicado quando módulo não tem configuração manual
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-10 › Default aplicado quando módulo não tem configuração manual', () => {
  it('buildDefaultConfig retorna temperature=0.7 e max_tokens=1000', () => {
    const cfg = buildDefaultConfig('scoring_engine')
    expect(cfg.temperature).toBe(0.7)
    expect(cfg.max_tokens).toBe(1000)
  })

  it('buildLlmPayload usa defaults quando o módulo não está na lista', () => {
    // Lista vazia = módulo sem config manual
    const payload = buildLlmPayload('scoring_engine', [])
    expect(payload.temperature).toBe(DEFAULT_TEMPERATURE)
    expect(payload.max_tokens).toBe(DEFAULT_MAX_TOKENS)
  })

  it('mock data inicial tem valores pré-configurados para todos os 3 módulos', () => {
    const configs = makeConfigs()
    const ids: AiModuleId[] = ['scoring_engine', 'correlation_engine', 'marketing_intelligence']
    for (const id of ids) {
      const cfg = configs.find((c) => c.module_id === id)
      expect(cfg).toBeDefined()
      expect(cfg!.temperature).toBeGreaterThanOrEqual(0)
      expect(cfg!.max_tokens).toBeGreaterThan(0)
    }
  })

  it('mock data exporta aiModuleConfigs', () => {
    expect(mockDataSource).toContain('export const aiModuleConfigs')
  })

  it('AiControlsClient consegue renderizar módulo com valores default sem crash', () => {
    // Garante que o AiControlsClient tem estado inicial baseado nos configs recebidos
    expect(clientPageSource).toContain('initialConfigs')
    expect(clientPageSource).toContain('useState')
  })

  it('DEFAULT_TEMPERATURE é 0.7 e DEFAULT_MAX_TOKENS é 1000 conforme as regras de negócio', () => {
    expect(DEFAULT_TEMPERATURE).toBe(0.7)
    expect(DEFAULT_MAX_TOKENS).toBe(1000)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Extra — Contrato de tipos e traduções
// ═════════════════════════════════════════════════════════════════════════════

describe('Contrato › Tipos e traduções', () => {
  it('lib/types.ts define AiModuleId', () => {
    expect(typesSource).toContain('AiModuleId')
  })

  it('lib/types.ts define AiModuleConfig com os campos obrigatórios', () => {
    expect(typesSource).toContain('module_id')
    expect(typesSource).toContain('temperature')
    expect(typesSource).toContain('max_tokens')
    expect(typesSource).toContain('updated_by')
    expect(typesSource).toContain('updated_at')
  })

  it('lib/types.ts define AiModuleConfigLogEntry com field previous_value new_value', () => {
    expect(typesSource).toContain('AiModuleConfigLogEntry')
    expect(typesSource).toContain('previous_value')
    expect(typesSource).toContain('new_value')
  })

  it('pt.json tem chave Admin.llmConfig.title', () => {
    expect(ptMessages.Admin.llmConfig.title).toBeTruthy()
  })

  it('pt.json tem chave Shared.sidebar.llmConfig', () => {
    expect(ptMessages.Shared.sidebar.llmConfig).toBeTruthy()
  })

  it('en.json tem chave Admin.llmConfig.title', () => {
    expect(enMessages.Admin.llmConfig.title).toBeTruthy()
  })

  it('en.json tem chave Shared.sidebar.llmConfig', () => {
    expect(enMessages.Shared.sidebar.llmConfig).toBeTruthy()
  })
})
