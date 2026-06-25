import { createAdminClient } from '@/lib/supabase/admin'
import type { CallResult } from '@/lib/types'

// Os dois estágios do funil (não confundir success com intent):
//   Stage 1 — Initial Result: sucesso = agendar o intro offer (call_outcome).
//   Stage 2 — Actual Close: sucesso = paying client (calls.stage2_outcome).
// A definição de "o que é sucesso" em cada stage é configurável por org
// (migration 093). Leitura UNIFICADA aqui — consumidores não tocam o schema.

export interface OrgStageConfig {
  // Quais call_outcome contam como sucesso no Stage 1 (default ['closed']).
  stage1SuccessOutcomes: CallResult[]
  // Rótulo/definição do que é paying client no Stage 2 (texto livre, opcional).
  stage2SuccessLabel: string | null
}

const DEFAULT_STAGE_CONFIG: OrgStageConfig = {
  stage1SuccessOutcomes: ['closed'],
  stage2SuccessLabel: null,
}

export async function getStageConfig(orgId: string): Promise<OrgStageConfig> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('organizations')
      .select('stage1_success_outcomes, stage2_success_label')
      .eq('id', orgId)
      .maybeSingle()

    if (error || !data) return DEFAULT_STAGE_CONFIG

    const outcomes = Array.isArray(data.stage1_success_outcomes)
      ? (data.stage1_success_outcomes as CallResult[])
      : DEFAULT_STAGE_CONFIG.stage1SuccessOutcomes

    return {
      stage1SuccessOutcomes: outcomes.length > 0 ? outcomes : DEFAULT_STAGE_CONFIG.stage1SuccessOutcomes,
      stage2SuccessLabel: (data.stage2_success_label as string | null) ?? null,
    }
  } catch {
    return DEFAULT_STAGE_CONFIG
  }
}

export async function updateStageConfig(
  orgId: string,
  input: Partial<OrgStageConfig>,
): Promise<OrgStageConfig | null> {
  try {
    const admin = createAdminClient()
    const patch: Record<string, unknown> = {}
    if (input.stage1SuccessOutcomes) patch.stage1_success_outcomes = input.stage1SuccessOutcomes
    if (input.stage2SuccessLabel !== undefined) patch.stage2_success_label = input.stage2SuccessLabel

    const { error } = await admin.from('organizations').update(patch).eq('id', orgId)
    if (error) return null

    return getStageConfig(orgId)
  } catch {
    return null
  }
}

// Leitura unificada: a call teve sucesso no Stage 1? (agendou o intro offer)
export function isStage1Success(result: CallResult, config: OrgStageConfig): boolean {
  return config.stage1SuccessOutcomes.includes(result)
}

// Leitura unificada: a call teve sucesso no Stage 2? (virou paying client)
export function isStage2Success(stage2Outcome: string | null | undefined): boolean {
  return stage2Outcome === 'paying'
}
