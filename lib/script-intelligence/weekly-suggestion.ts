import { generateText } from 'ai'
import { getOpenAIModel } from '@/lib/openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { dbCreateScript } from '@/lib/db/scripts'
import { recordLlmUsage } from '@/lib/services/llm-usage'
import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/script-intelligence/generate-script-prompt'

// Geração automática semanal do script sugerido enviado a todas as
// organizações (ver app/api/cron/weekly-script-suggestion/route.ts). Espelha
// o fluxo manual (admin gera no Script Builder + envia via SaaS Panel), mas
// usa como matéria-prima as 5 melhores calls fechadas (closed, maior
// overall_score) de TODA a base — não de uma org específica — pra refletir
// os padrões de sucesso mais recentes observados no conjunto de clientes.

// Rubric usada como estrutura-base do script gerado (AskMoses Demo Org).
// Fallback fixo: nenhuma org "dona" real do script gerado — ele é um
// catálogo (org_id null) enviado a todas, então precisa de uma rubric de
// referência estável para herdar rubric_version_snapshot/minor_version.
const FALLBACK_RUBRIC_ID = '5ad2a6c7-7d50-4640-a01d-b7f3db3b3a81'

const MIN_TRANSCRIPT_LENGTH = 100
const CALLS_TO_USE = 5
const CALLS_OVER_FETCH = 30

export type WeeklySuggestionResult =
  | { ok: true; scriptId: string; callIds: string[] }
  | { ok: false; error: string }

async function pickTopClosedCalls(): Promise<{ id: string; transcript: string }[]> {
  const admin = createAdminClient()

  const { data: callsRaw, error } = await admin
    .from('calls')
    .select('id, transcript, overall_score')
    .eq('call_outcome', 'closed')
    .not('transcript', 'is', null)
    .order('overall_score', { ascending: false, nullsFirst: false })
    .limit(CALLS_OVER_FETCH)

  if (error) throw error

  const eligible = (callsRaw ?? []).filter(
    (c: { transcript: string | null }) => c.transcript && c.transcript.length > MIN_TRANSCRIPT_LENGTH,
  )

  return eligible.slice(0, CALLS_TO_USE).map((c) => ({
    id: c.id as string,
    transcript: c.transcript as string,
  }))
}

async function resolveBaseRubricId(): Promise<string> {
  const admin = createAdminClient()

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

function parseGeneratedScript(text: string): GeneratedScriptPayload {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const parsed = JSON.parse(cleaned) as GeneratedScriptPayload
  if (!parsed.name || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    throw new Error('Invalid structure')
  }
  return parsed
}

/**
 * Gera e persiste o script sugerido semanal. Não envia às orgs — isso é
 * responsabilidade do caller (cron route), via lib/services/send-script.ts,
 * já que "gerar" e "enviar" são passos logicamente distintos e o cron
 * precisa da lista de orgs (não resolvida aqui).
 */
export async function generateWeeklySuggestedScript(): Promise<WeeklySuggestionResult> {
  const admin = createAdminClient()

  let selectedCalls: { id: string; transcript: string }[]
  try {
    selectedCalls = await pickTopClosedCalls()
  } catch (err) {
    return { ok: false, error: `Failed to fetch calls: ${err instanceof Error ? err.message : 'unknown'}` }
  }

  if (selectedCalls.length === 0) {
    return { ok: false, error: 'No closed calls with eligible transcripts found' }
  }

  const transcripts = selectedCalls.map((c) => c.transcript)

  let text: string
  try {
    const aiResult = await generateText({
      model: getOpenAIModel('gpt-4o-mini'),
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(transcripts, null),
    })
    text = aiResult.text

    void recordLlmUsage({
      orgId: null,
      surface: 'script_generation',
      model: 'gpt-4o-mini',
      inputTokens: aiResult.usage?.inputTokens ?? 0,
      outputTokens: aiResult.usage?.outputTokens ?? 0,
      ref: 'weekly-script-suggestion',
    })
  } catch (err) {
    return { ok: false, error: `AI call failed: ${err instanceof Error ? err.message : 'unknown'}` }
  }

  let parsed: GeneratedScriptPayload
  try {
    parsed = parseGeneratedScript(text)
  } catch {
    return { ok: false, error: 'AI returned invalid JSON' }
  }

  const rubricId = await resolveBaseRubricId()

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
      sections: parsed.sections,
      full_script: parsed.full_script,
      criteria: [],
      isActive: false,
    })
  } catch (err) {
    return { ok: false, error: `Failed to persist script: ${err instanceof Error ? err.message : 'unknown'}` }
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

  return { ok: true, scriptId: newScript.id, callIds: selectedCalls.map((c) => c.id) }
}
