import { createAdminClient } from '@/lib/supabase/admin'
import type { AiModuleConfig, AiModuleConfigLogEntry, AiModuleId } from '@/lib/types'
import {
  AI_MODULE_DEFAULTS,
  isAiModuleId,
  validateMaxTokens,
  validateTemperature,
} from '@/lib/constants/ai-modules'

// ─── Persistência do tuning por módulo (ai_module_configs / ..._log) ─────────
//
// Substitui os arrays em memória de lib/mock-data.ts. Leitura pelo pipeline usa
// cache de 5min (getModuleTuning); a UI admin lê sem cache (getAllModuleConfigs)
// pra sempre refletir o último save.

interface DbConfigRow {
  module_id: string
  temperature: number | string
  max_tokens: number
  updated_by: string | null
  updated_at: string
}

interface DbLogRow {
  id: string
  module_id: string
  field: string
  previous_value: number | string
  new_value: number | string
  updated_by: string | null
  updated_at: string
}

function toConfig(r: DbConfigRow): AiModuleConfig {
  return {
    module_id: r.module_id as AiModuleId,
    temperature: Number(r.temperature),
    max_tokens: Number(r.max_tokens),
    updated_by: r.updated_by ?? 'system',
    updated_at: r.updated_at,
  }
}

function toLogEntry(r: DbLogRow): AiModuleConfigLogEntry {
  return {
    id: r.id,
    module_id: r.module_id as AiModuleId,
    field: r.field as 'temperature' | 'max_tokens',
    previous_value: Number(r.previous_value),
    new_value: Number(r.new_value),
    updated_by: r.updated_by ?? 'system',
    updated_at: r.updated_at,
  }
}

// ─── Leitura para a UI admin (sem cache) ──────────────────────────────────────

export async function getAllModuleConfigs(): Promise<{
  configs: AiModuleConfig[]
  log: AiModuleConfigLogEntry[]
}> {
  const admin = createAdminClient()
  const [{ data: configRows, error: cErr }, { data: logRows, error: lErr }] = await Promise.all([
    admin
      .from('ai_module_configs')
      .select('module_id, temperature, max_tokens, updated_by, updated_at')
      .order('module_id', { ascending: true }),
    admin
      .from('ai_module_config_log')
      .select('id, module_id, field, previous_value, new_value, updated_by, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100),
  ])
  if (cErr) throw cErr
  if (lErr) throw lErr
  return {
    configs: ((configRows as DbConfigRow[] | null) ?? []).map(toConfig),
    log: ((logRows as DbLogRow[] | null) ?? []).map(toLogEntry),
  }
}

// ─── Update com log (rota admin) ──────────────────────────────────────────────

export type UpdateModuleResult =
  | { config: AiModuleConfig; log: AiModuleConfigLogEntry[] }
  | { error: string; code: number }

export async function updateModuleConfig(payload: {
  module_id: string
  temperature: number
  max_tokens: number
  updated_by: string
}): Promise<UpdateModuleResult> {
  if (!isAiModuleId(payload.module_id)) {
    return { error: `Módulo "${payload.module_id}" inválido`, code: 400 }
  }
  const tempErr = validateTemperature(payload.temperature)
  if (tempErr) return { error: tempErr, code: 400 }
  const tokensErr = validateMaxTokens(payload.max_tokens)
  if (tokensErr) return { error: tokensErr, code: 400 }

  const admin = createAdminClient()

  const { data: prevRow, error: readErr } = await admin
    .from('ai_module_configs')
    .select('module_id, temperature, max_tokens, updated_by, updated_at')
    .eq('module_id', payload.module_id)
    .maybeSingle()
  if (readErr) throw readErr
  if (!prevRow) return { error: 'Module not found', code: 404 }

  const prev = toConfig(prevRow as DbConfigRow)
  const now = new Date().toISOString()

  // Log append-only: uma entrada por campo alterado.
  const logInserts: Array<{
    module_id: string
    field: 'temperature' | 'max_tokens'
    previous_value: number
    new_value: number
    updated_by: string
    updated_at: string
  }> = []
  if (prev.temperature !== payload.temperature) {
    logInserts.push({
      module_id: payload.module_id,
      field: 'temperature',
      previous_value: prev.temperature,
      new_value: payload.temperature,
      updated_by: payload.updated_by,
      updated_at: now,
    })
  }
  if (prev.max_tokens !== payload.max_tokens) {
    logInserts.push({
      module_id: payload.module_id,
      field: 'max_tokens',
      previous_value: prev.max_tokens,
      new_value: payload.max_tokens,
      updated_by: payload.updated_by,
      updated_at: now,
    })
  }

  const { data: updatedRow, error: updateErr } = await admin
    .from('ai_module_configs')
    .update({
      temperature: payload.temperature,
      max_tokens: payload.max_tokens,
      updated_by: payload.updated_by,
      updated_at: now,
    })
    .eq('module_id', payload.module_id)
    .select('module_id, temperature, max_tokens, updated_by, updated_at')
    .single()
  if (updateErr) throw updateErr

  if (logInserts.length > 0) {
    const { error: logErr } = await admin.from('ai_module_config_log').insert(logInserts)
    if (logErr) throw logErr
  }

  // Invalida o cache do pipeline pra a próxima execução já ler o novo valor.
  invalidateModuleTuningCache()

  const { log } = await getAllModuleConfigs()
  return { config: toConfig(updatedRow as DbConfigRow), log }
}

// ─── Leitura para o pipeline (cache de 5min) ──────────────────────────────────
// Cada engine chama getModuleTuning(moduleId) antes de rodar. Sem linha no
// banco (pré-migração / query falha) → cai no default hardcoded do módulo;
// nunca quebra o pipeline.

export interface ModuleTuning {
  temperature: number
  max_tokens: number
}

interface TuningCacheState {
  byModule: Map<AiModuleId, ModuleTuning> | null
  expiresAt: number
}
const TUNING_TTL_MS = 5 * 60 * 1000
const tuningKey_ = Symbol.for('askmoses.aimodule.tuning')
type GlobalWithTuning = typeof globalThis & { [tuningKey_]?: TuningCacheState }
const gp = globalThis as GlobalWithTuning

export function invalidateModuleTuningCache(): void {
  delete gp[tuningKey_]
}

async function loadTuningMap(): Promise<Map<AiModuleId, ModuleTuning> | null> {
  const cached = gp[tuningKey_]
  if (cached && cached.expiresAt > Date.now()) return cached.byModule

  let byModule: Map<AiModuleId, ModuleTuning> | null = null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('ai_module_configs')
      .select('module_id, temperature, max_tokens')
    if (error) throw error
    byModule = new Map()
    for (const r of (data as DbConfigRow[] | null) ?? []) {
      if (isAiModuleId(r.module_id)) {
        byModule.set(r.module_id, {
          temperature: Number(r.temperature),
          max_tokens: Number(r.max_tokens),
        })
      }
    }
  } catch (err) {
    console.warn('[ai-module-configs] failed to load tuning (falling back to defaults):', err)
    byModule = null
  }

  gp[tuningKey_] = { byModule, expiresAt: Date.now() + TUNING_TTL_MS }
  return byModule
}

/**
 * Tuning (temperature + max_tokens) de um módulo, lido antes de cada execução
 * (cache 5min). Fallback pro default hardcoded do módulo quando não há linha.
 */
export async function getModuleTuning(moduleId: AiModuleId): Promise<ModuleTuning> {
  const map = await loadTuningMap()
  return map?.get(moduleId) ?? AI_MODULE_DEFAULTS[moduleId]
}
