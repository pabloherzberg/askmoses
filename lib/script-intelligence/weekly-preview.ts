import { createAdminClient } from '@/lib/supabase/admin'
import { dbCreateScript } from '@/lib/db/scripts'
import { sendScriptToOrgs } from '@/lib/services/send-script'
import { PROVIDER_CATALOG } from '@/lib/llm/catalog'
import {
  draftWeeklySuggestedScript,
  resolveBaseRubricId,
  type WeeklyDraftResult,
} from '@/lib/script-intelligence/weekly-suggestion'

// Preview da sugestão semanal de script, rodado à mão
// (scripts/preview-weekly-suggestion.mts). Usa o MESMO código do cron para
// seleção, IA, validação e anonimização (draftWeeklySuggestedScript).
//
// dry-run (padrão): só imprime. Não grava NADA — nem scripts, nem
// org_scripts, nem script_suggestion_runs, nem llm_usage.
//
// --send-to <orgId>: só para org is_demo = true. Grava o script com
// org_id = essa org (NÃO global: o onboarding pega o script global mais
// recente, org_id IS NULL, e não pode pegar um teste), envia como pending só
// para ela e registra a rodada com source = 'manual_test' (migration 123).
//
// Por que não mexe no cron de segunda:
//   - o cron envia só para orgs is_demo = false, e o --send-to só aceita
//     is_demo = true — o pending de teste e o do cron nunca se cruzam;
//   - versão: o cron calcula max(rubric_version_snapshot,
//     minor_version) + 1 entre os scripts da rubric. O script de teste NÃO
//     grava essas colunas e fica com os defaults do banco (1, 0) — o menor
//     par possível (em prod, 30/09/2026: mínimo 1 e 0 em 18 scripts). Não
//     sobe o máximo, então o próximo minor_version do cron não muda.

export const MANUAL_TEST_SOURCE = 'manual_test'
const USAGE_REF = 'weekly-script-preview'

/** `model` ausente = o modelo do cron (WEEKLY_DEFAULT_MODEL). */
export type PreviewArgs =
  | { mode: 'dry-run'; model?: string }
  | { mode: 'send'; orgId: string; model?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Tira `--flag <valor>` de argv. undefined = flag ausente; null = flag sem valor. */
function takeValue(argv: string[], flag: string): string | null | undefined {
  const i = argv.indexOf(flag)
  if (i === -1) return undefined
  const value = argv[i + 1]
  argv.splice(i, value === undefined || value.startsWith('--') ? 1 : 2)
  return value === undefined || value.startsWith('--') ? null : value
}

export function parsePreviewArgs(input: string[]): PreviewArgs | { error: string } {
  const argv = [...input]

  const model = takeValue(argv, '--model')
  if (model === null) return { error: `--model precisa de um id: ${PROVIDER_CATALOG.openai.models.join(' | ')}` }
  if (model !== undefined && !PROVIDER_CATALOG.openai.models.includes(model)) {
    return { error: `modelo fora do catálogo OpenAI: ${model}. Use: ${PROVIDER_CATALOG.openai.models.join(' | ')}` }
  }

  const orgId = takeValue(argv, '--send-to')
  const dryRun = argv.includes('--dry-run')
  const rest = argv.filter((a) => a !== '--dry-run')
  if (rest.length > 0) return { error: `argumento desconhecido: ${rest.join(' ')}` }

  const withModel = model !== undefined ? { model } : {}
  if (orgId === undefined) return { mode: 'dry-run', ...withModel }
  if (dryRun) return { error: 'use --dry-run OU --send-to <orgId>, não os dois' }
  if (!orgId || !UUID.test(orgId)) return { error: '--send-to precisa de um orgId (uuid)' }
  return { mode: 'send', orgId, ...withModel }
}

export type PreviewOutcome =
  | { status: 'refused'; reason: string }
  | { status: 'dry-run'; draft: WeeklyDraftResult }
  | { status: 'sent'; draft: Extract<WeeklyDraftResult, { ok: true }>; scriptId: string; runId: string | null }
  | { status: 'failed'; draft: WeeklyDraftResult; error: string; runId: string | null }

type Admin = ReturnType<typeof createAdminClient>

/** Texto do relatório: orgs incluídas/puladas, calls, script nas 5 seções, substituições. */
export function formatPreviewReport(draft: WeeklyDraftResult): string {
  const out: string[] = []
  const sel = draft.selection
  if (sel) {
    out.push(`Orgs incluídas (${sel.included.length}):`)
    for (const o of sel.included) {
      out.push(`  - ${o.orgName} (${o.orgId})`)
      for (const c of o.calls) out.push(`      call ${c.id}  score ${c.overallScore}`)
    }
    out.push(`Orgs puladas (${sel.skipped.length}):`)
    for (const o of sel.skipped) {
      out.push(`  - ${o.orgName} (${o.orgId}): ${o.reason} [${o.eligibleCalls} elegíveis]`)
    }
    out.push(`call_ids: ${sel.included.flatMap((o) => o.calls.map((c) => c.id)).join(', ') || '—'}`)
  }
  if (draft.usage) {
    out.push(`IA: ${draft.usage.model} · ${draft.usage.inputTokens} in / ${draft.usage.outputTokens} out · US$ ${draft.usage.costUsd.toFixed(4)}`)
  }
  if (!draft.ok) {
    out.push('', `SEM SCRIPT (${draft.kind}): ${draft.error}`)
    return out.join('\n')
  }
  const s = draft.script
  out.push('', `Script: ${s.name}`, `Descrição: ${s.description}`)
  for (const sec of s.sections) {
    out.push('', `## ${sec.name}  (peso ${sec.weight}${sec.critical ? ', crítica' : ''})`, sec.instructions)
    if (sec.tips) out.push(`Dicas: ${sec.tips}`)
  }
  out.push('', 'Substituições (anonimização):')
  if (draft.redactions.length === 0) out.push('  nenhuma')
  for (const r of draft.redactions) out.push(`  ${r.kind}  ${r.field}  ×${r.count}`)
  return out.join('\n')
}

async function checkDemoOrg(admin: Admin, orgId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('organizations')
    .select('id, name, is_demo')
    .eq('id', orgId)
    .maybeSingle()
  if (error) return `falha ao ler a org: ${error.message}`
  if (!data) return `org ${orgId} não encontrada`
  const org = data as { name: string | null; is_demo: boolean | null }
  if (org.is_demo !== true) {
    return `org "${org.name ?? orgId}" não é is_demo = true — o teste só pode ir para org interna`
  }
  // A marca de teste manual precisa da migration 123. Confere antes de gastar IA.
  const { error: colErr } = await admin.from('script_suggestion_runs').select('source').limit(1)
  if (colErr) return `script_suggestion_runs.source indisponível (aplicar migration 123): ${colErr.message}`
  return null
}

async function recordManualRun(
  admin: Admin,
  draft: WeeklyDraftResult,
  opts: { status: 'sent' | 'skipped' | 'error'; scriptId: string | null; error?: string },
): Promise<string | null> {
  const included = (draft.selection?.included ?? []).map((o) => ({
    org_id: o.orgId,
    org_name: o.orgName,
    call_ids: o.calls.map((c) => c.id),
  }))
  const skipped = (draft.selection?.skipped ?? []).map((o) => ({
    org_id: o.orgId,
    org_name: o.orgName,
    eligible_calls: o.eligibleCalls,
    reason: o.reason,
  }))
  const { data, error } = await admin
    .from('script_suggestion_runs')
    .insert({
      source: MANUAL_TEST_SOURCE,
      status: opts.status,
      included_orgs: included,
      skipped_orgs: skipped,
      call_ids: included.flatMap((o) => o.call_ids),
      script_id: opts.scriptId,
      redactions: draft.ok ? draft.redactions : [],
      sent_to_count: opts.status === 'sent' ? 1 : null,
      model: draft.usage?.model ?? null,
      input_tokens: draft.usage?.inputTokens ?? null,
      output_tokens: draft.usage?.outputTokens ?? null,
      cost_usd: draft.usage?.costUsd ?? null,
      error: opts.error ?? (draft.ok ? null : draft.error),
    })
    .select('id')
    .single()
  if (error) {
    console.error('[weekly-preview] falha ao registrar a rodada:', error.message)
    return null
  }
  return (data as { id: string }).id
}

export async function runWeeklyPreview(args: PreviewArgs): Promise<PreviewOutcome> {
  const admin = createAdminClient()

  if (args.mode === 'dry-run') {
    const draft = await draftWeeklySuggestedScript(admin, { recordUsage: null, model: args.model })
    return { status: 'dry-run', draft }
  }

  // Recusa ANTES de chamar a IA ou gravar qualquer coisa.
  const refusal = await checkDemoOrg(admin, args.orgId)
  if (refusal) return { status: 'refused', reason: refusal }

  const draft = await draftWeeklySuggestedScript(admin, {
    recordUsage: { orgId: args.orgId, ref: USAGE_REF },
    model: args.model,
  })
  if (!draft.ok) {
    const runId = await recordManualRun(admin, draft, { status: draft.kind, scriptId: null })
    return { status: 'failed', draft, error: draft.error, runId }
  }

  let scriptId: string
  try {
    const created = await dbCreateScript({
      // Da org de teste, NUNCA global (org_id null) — ver cabeçalho.
      orgId: args.orgId,
      rubricId: await resolveBaseRubricId(admin),
      name: draft.script.name,
      description: draft.script.description,
      sections: draft.script.sections,
      full_script: draft.script.full_script,
      criteria: [],
      isActive: false,
    })
    scriptId = created.id
    // Sem UPDATE de rubric_version_snapshot/minor_version: ficam os defaults
    // (1, 0) e o próximo minor_version do cron não muda.
  } catch (err) {
    const error = `falha ao gravar o script: ${err instanceof Error ? err.message : 'unknown'}`
    const runId = await recordManualRun(admin, draft, { status: 'error', scriptId: null, error })
    return { status: 'failed', draft, error, runId }
  }

  try {
    await sendScriptToOrgs({ scriptId, orgIds: [args.orgId], sentBy: null })
  } catch (err) {
    const error = `falha ao enviar para a org: ${err instanceof Error ? err.message : 'unknown'}`
    const runId = await recordManualRun(admin, draft, { status: 'error', scriptId, error })
    return { status: 'failed', draft, error, runId }
  }

  const runId = await recordManualRun(admin, draft, { status: 'sent', scriptId })
  return { status: 'sent', draft, scriptId, runId }
}
