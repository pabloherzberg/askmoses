import { generateText } from 'ai'
import { getOpenAIModel, resolveOpenAIModelId } from '@/lib/openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { applySalesCallOnly, excludeFailedScoring } from '@/lib/sales-calls'
import { dbCreateScript } from '@/lib/db/scripts'
import { computeCostForModel, recordLlmUsage } from '@/lib/services/llm-usage'
import {
  WEEKLY_SYSTEM_PROMPT,
  buildWeeklyUserPrompt,
  validateWeeklyScript,
} from '@/lib/script-intelligence/weekly-prompt'
import {
  WEEKLY_WINDOW_DAYS,
  selectWeeklyCalls,
  type WeeklyCandidateCall,
  type WeeklyOrg,
  type WeeklySelection,
} from '@/lib/script-intelligence/weekly-selection'

// Geração automática semanal do script sugerido enviado a todas as
// organizações (ver app/api/cron/weekly-script-suggestion/route.ts).
//
// Continua GLOBAL (um script para todas as orgs), mas a matéria-prima mudou
// (30/09/2026): antes eram as 5 calls de maior score da base inteira — na
// prática, todas da org de demonstração. Agora são 3 calls vencedoras
// (fechadas E ganhas no GHL) de CADA org elegível, sem orgs is_demo. Seleção
// em weekly-selection.ts; prompt e validação das 5 seções em weekly-prompt.ts.

// Rubric usada como estrutura-base do script gerado (AskMoses Demo Org).
// Fallback fixo: nenhuma org "dona" real do script gerado — ele é um
// catálogo (org_id null) enviado a todas, então precisa de uma rubric de
// referência estável para herdar rubric_version_snapshot/minor_version.
const FALLBACK_RUBRIC_ID = '5ad2a6c7-7d50-4640-a01d-b7f3db3b3a81'

const MODEL = 'gpt-4o-mini'
const PAGE_SIZE = 1000

export interface WeeklyUsage {
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export type WeeklySuggestionResult =
  | { ok: true; scriptId: string; selection: WeeklySelection; usage: WeeklyUsage }
  | {
      ok: false
      /** skipped: nenhuma org elegível (não é erro). error: falhou. */
      kind: 'skipped' | 'error'
      error: string
      selection?: WeeklySelection
      usage?: WeeklyUsage
    }

type Admin = ReturnType<typeof createAdminClient>

export async function fetchWeeklyOrgs(admin: Admin): Promise<WeeklyOrg[]> {
  const { data, error } = await admin.from('organizations').select('id, name, is_demo')
  if (error) throw new Error(`organizations: ${error.message}`)
  return (data ?? []).map((o: { id: string; name: string | null; is_demo: boolean | null }) => ({
    id: o.id,
    name: o.name ?? o.id,
    is_demo: o.is_demo === true,
  }))
}

/**
 * Candidatas de TODAS as orgs: fechadas, ganhas no GHL (NÃO Stage 2), de
 * venda, com score válido e transcrição, nos últimos 90 dias. O corte de 3
 * por org e o tamanho mínimo da transcrição ficam em selectWeeklyCalls.
 */
export async function fetchWeeklyCandidateCalls(admin: Admin, now: Date = new Date()): Promise<WeeklyCandidateCall[]> {
  const since = new Date(now.getTime() - WEEKLY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const rows: WeeklyCandidateCall[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await excludeFailedScoring(
      applySalesCallOnly(
        admin
          .from('calls')
          .select('id, org_id, overall_score, transcript, created_at')
          .eq('call_outcome', 'closed')
          .eq('ghl_won_status', 'won')
          .not('overall_score', 'is', null)
          .not('transcript', 'is', null)
          .gte('created_at', since),
      ),
    )
      .order('overall_score', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(`calls (offset ${from}): ${error.message}`)
    const page = (data ?? []) as WeeklyCandidateCall[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  return rows.map((r) => ({ ...r, overall_score: Number(r.overall_score) }))
}

async function resolveBaseRubricId(admin: Admin): Promise<string> {
  // Rubric do script atualmente ativo (qualquer org que tenha org_scripts
  // ativo hoje) — best-effort; se não encontrar, cai no fallback fixo.
  const { data: activeOrgScript } = await admin
    .from('org_scripts')
    .select('scripts!script_id(rubric_id)')
    .eq('status', 'active')
    .is('ended_at', null)
    .limit(1)
    .maybeSingle()

  const embedded = (activeOrgScript as unknown as { scripts: { rubric_id: string } | { rubric_id: string }[] | null } | null)?.scripts
  const rubricId = embedded
    ? (Array.isArray(embedded) ? embedded[0]?.rubric_id : embedded.rubric_id)
    : null

  return rubricId ?? FALLBACK_RUBRIC_ID
}

interface GeneratedScriptPayload {
  name: string
  description: string
  sections: Array<{
    name: string
    instructions: string
    tips: string
    weight: number
    critical: boolean
  }>
  full_script: string
  explanation: string
}

/**
 * Seleciona, gera, valida e persiste o script sugerido semanal. Não envia às
 * orgs — isso é do caller (cron route), via lib/services/send-script.ts.
 */
export async function generateWeeklySuggestedScript(): Promise<WeeklySuggestionResult> {
  const admin = createAdminClient()

  let selection: WeeklySelection
  try {
    const [orgs, candidates] = await Promise.all([fetchWeeklyOrgs(admin), fetchWeeklyCandidateCalls(admin)])
    selection = selectWeeklyCalls(orgs, candidates)
  } catch (err) {
    return { ok: false, kind: 'error', error: `Falha na seleção de calls: ${err instanceof Error ? err.message : 'unknown'}` }
  }

  if (selection.included.length === 0) {
    return { ok: false, kind: 'skipped', error: 'Nenhuma org com calls vencedoras suficientes', selection }
  }

  let text: string
  let usage: WeeklyUsage
  try {
    const aiResult = await generateText({
      model: getOpenAIModel(MODEL),
      system: WEEKLY_SYSTEM_PROMPT,
      prompt: buildWeeklyUserPrompt(selection.included),
    })
    text = aiResult.text

    const inputTokens = aiResult.usage?.inputTokens ?? 0
    const outputTokens = aiResult.usage?.outputTokens ?? 0
    usage = {
      model: MODEL,
      inputTokens,
      outputTokens,
      costUsd: await computeCostForModel('openai', resolveOpenAIModelId(MODEL), inputTokens, outputTokens),
    }

    void recordLlmUsage({
      orgId: null,
      surface: 'script_generation',
      model: MODEL,
      inputTokens,
      outputTokens,
      ref: 'weekly-script-suggestion',
    })
  } catch (err) {
    return { ok: false, kind: 'error', error: `AI call failed: ${err instanceof Error ? err.message : 'unknown'}`, selection }
  }

  let parsed: GeneratedScriptPayload
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    parsed = JSON.parse(cleaned) as GeneratedScriptPayload
  } catch {
    return { ok: false, kind: 'error', error: 'AI returned invalid JSON', selection, usage }
  }

  // As 5 seções fixas, nessa ordem — senão não grava nem envia.
  const invalid = validateWeeklyScript(parsed)
  if (invalid) {
    return { ok: false, kind: 'error', error: `Script inválido: ${invalid}`, selection, usage }
  }

  const rubricId = await resolveBaseRubricId(admin)

  // Herda rubric_version_snapshot/minor_version do script mais recente dessa
  // rubric, incrementando minor_version — mesmo padrão de
  // app/api/admin/scripts/save/route.ts (source.minor_version + 1).
  const { data: latestForRubric } = await admin
    .from('scripts')
    .select('rubric_version_snapshot, minor_version')
    .eq('rubric_id', rubricId)
    .order('rubric_version_snapshot', { ascending: false, nullsFirst: false })
    .order('minor_version', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  const nextMinor = ((latestForRubric?.minor_version as number | null) ?? 0) + 1
  const rubricVersionSnapshot = (latestForRubric?.rubric_version_snapshot as number | null) ?? 1

  let newScript
  try {
    newScript = await dbCreateScript({
      rubricId,
      name: parsed.name,
      description: parsed.description,
      // Pesos exatamente como antes: o que a IA devolveu.
      sections: parsed.sections,
      full_script: parsed.full_script,
      criteria: [],
      isActive: false,
    })
  } catch (err) {
    return {
      ok: false,
      kind: 'error',
      error: `Failed to persist script: ${err instanceof Error ? err.message : 'unknown'}`,
      selection,
      usage,
    }
  }

  const { error: versionErr } = await admin
    .from('scripts')
    .update({
      rubric_version_snapshot: rubricVersionSnapshot,
      minor_version: nextMinor,
    })
    .eq('id', newScript.id)

  if (versionErr) {
    console.error('[weekly-suggestion] failed to set version columns (non-fatal):', versionErr)
  }

  return { ok: true, scriptId: newScript.id, selection, usage }
}
