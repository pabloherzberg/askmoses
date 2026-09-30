import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateWeeklySuggestedScript, type WeeklySuggestionResult } from '@/lib/script-intelligence/weekly-suggestion'
import type { WeeklySelection } from '@/lib/script-intelligence/weekly-selection'
import { sendScriptToOrgs } from '@/lib/services/send-script'

// Teto explícito: a rodada faz a chamada LLM inteira no request (gpt-6.1-sol,
// modelo de raciocínio, ~15 transcrições de até 8.000 caracteres) e depois
// grava e envia para as orgs. 300s é o default do Fluid Compute; o plano Pro
// permite até 800 se a medição (preview com timings por fase) pedir mais.
export const maxDuration = 300

// GET /api/cron/weekly-script-suggestion
//
//   Roda 1x por semana (vercel.json: "0 8 * * 1", segunda 08:00 UTC).
//   Gera UM script a partir de 3 calls vencedoras (fechadas E ganhas no GHL)
//   de cada org elegível — nunca de orgs is_demo — e envia esse MESMO
//   script como sugestão (pending) a todas as orgs que não são demo,
//   replicando o fluxo manual do admin no SaaS Panel
//   (POST /api/admin/scripts/send). O owner aprova ou não; o script ativo de
//   nenhuma org muda sozinho.
//
//   Antes de gravar, o código substitui valores monetários e nomes de
//   org/trainer/lead das calls usadas por placeholders (weekly-anonymization.ts);
//   o que foi trocado vai para script_suggestion_runs.redactions (migration 122).
//
//   Toda rodada grava uma linha em script_suggestion_runs (migration 121):
//   orgs incluídas e puladas com motivo, calls usadas, script, custo e erro.
//   Org com menos de 3 calls vencedoras é pulada — a rodada segue com as
//   outras.
//
//   A análise de Script Intelligence é disparada pelo mesmo mecanismo do
//   envio manual (sendScriptToOrgs → fire-and-forget pra
//   /api/script-intelligence/process), que se auto-encadeia entre as orgs.
//
//   Auth: header 'Authorization: Bearer $CRON_SECRET' (padrão Vercel Cron).
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return Response.json({ error: 'forbidden' }, { status: 401 })
  }

  const admin = createAdminClient()
  const generation = await generateWeeklySuggestedScript()

  if (!generation.ok) {
    const runId = await recordRun(admin, generation, { status: generation.kind })
    if (generation.kind === 'error') {
      console.error('[cron/weekly-script-suggestion] generation failed:', generation.error)
      return Response.json({ error: generation.error, runId }, { status: 500 })
    }
    return Response.json({ skipped: true, reason: generation.error, runId })
  }

  // Destinatárias: todas as orgs que não são demo.
  const { data: orgs, error: orgsErr } = await admin
    .from('organizations')
    .select('id')
    .eq('is_demo', false)

  if (orgsErr) {
    const message = `failed to list organizations: ${orgsErr.message}`
    const runId = await recordRun(admin, generation, { status: 'error', error: message })
    console.error('[cron/weekly-script-suggestion]', message)
    return Response.json({ error: message, scriptId: generation.scriptId, runId }, { status: 500 })
  }

  const orgIds = (orgs ?? []).map((o: { id: string }) => o.id)

  try {
    const result = orgIds.length > 0
      ? await sendScriptToOrgs({ scriptId: generation.scriptId, orgIds, sentBy: null })
      : { sentTo: 0 }

    const runId = await recordRun(admin, generation, { status: 'sent', sentTo: result.sentTo })
    return Response.json({
      scriptId: generation.scriptId,
      orgsIncluded: generation.selection.included.length,
      orgsSkipped: generation.selection.skipped.length,
      orgsSent: result.sentTo,
      runId,
    })
  } catch (err) {
    const message = `failed to send script to organizations: ${err instanceof Error ? err.message : 'unknown'}`
    const runId = await recordRun(admin, generation, { status: 'error', error: message })
    console.error('[cron/weekly-script-suggestion]', message)
    return Response.json({ error: message, scriptId: generation.scriptId, runId }, { status: 500 })
  }
}

/** Uma linha em script_suggestion_runs. Falha de gravação só loga — não derruba a rodada. */
async function recordRun(
  admin: ReturnType<typeof createAdminClient>,
  generation: WeeklySuggestionResult,
  opts: { status: 'sent' | 'skipped' | 'error'; error?: string; sentTo?: number },
): Promise<string | null> {
  const selection: WeeklySelection | undefined = generation.selection
  const included = (selection?.included ?? []).map((o) => ({
    org_id: o.orgId,
    org_name: o.orgName,
    call_ids: o.calls.map((c) => c.id),
  }))
  const skipped = (selection?.skipped ?? []).map((o) => ({
    org_id: o.orgId,
    org_name: o.orgName,
    eligible_calls: o.eligibleCalls,
    reason: o.reason,
  }))

  const { data, error } = await admin
    .from('script_suggestion_runs')
    .insert({
      status: opts.status,
      included_orgs: included,
      skipped_orgs: skipped,
      call_ids: included.flatMap((o) => o.call_ids),
      script_id: generation.ok ? generation.scriptId : null,
      // Substituições de anonimização (migration 122): tipo, campo e
      // quantidade — sem o termo original.
      redactions: generation.ok ? generation.redactions : [],
      sent_to_count: opts.sentTo ?? null,
      model: generation.usage?.model ?? null,
      input_tokens: generation.usage?.inputTokens ?? null,
      output_tokens: generation.usage?.outputTokens ?? null,
      cost_usd: generation.usage?.costUsd ?? null,
      error: opts.error ?? (generation.ok ? null : generation.error),
    })
    .select('id')
    .single()

  if (error) {
    console.error('[cron/weekly-script-suggestion] failed to record run:', error.message)
    return null
  }
  return (data as { id: string }).id
}
