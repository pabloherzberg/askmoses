import { createAdminClient } from '@/lib/supabase/admin'
import { selfBaseUrl } from '@/lib/internal-url'

// Extraído de app/api/admin/scripts/send/route.ts — a parte da lógica de
// envio que é idêntica entre o fluxo manual do admin (SaaS Panel) e a
// automação semanal (cron): RPC de criação do pending, resolução do
// previous_script_id por org, upsert do cache de Script Intelligence e
// dispatch fire-and-forget da primeira análise da fila. `sentBy` é o único
// dado que diverge entre os dois callers (usuário admin vs. null pro cron).

export interface SendScriptRow {
  id: string
  orgId: string
  scriptId: string
  status: string
  startedAt: string
}

export interface SendScriptResult {
  scriptId: string
  sentTo: number
  rows: SendScriptRow[]
}

export async function sendScriptToOrgs(params: {
  scriptId: string
  orgIds: string[]
  orgIdsOrdered?: string[]
  sentBy: string | null
}): Promise<SendScriptResult> {
  const { scriptId, orgIds, orgIdsOrdered, sentBy } = params
  const admin = createAdminClient()

  // RPC transacional (migration 050/069): fecha pending aberto anterior +
  // upsert do novo pending numa única transação, sem tocar no active.
  const { data: rpcData, error: rpcErr } = await admin.rpc('send_script_to_orgs', {
    p_script_id: scriptId,
    p_org_ids: orgIds,
    p_sent_by: sentBy,
  })

  if (rpcErr) throw rpcErr

  const rows = (rpcData ?? []) as Array<{
    out_id: string
    out_org_id: string
    out_script_id: string
    out_status: string
    out_started_at: string
  }>

  const rowByOrgId = Object.fromEntries(rows.map((r) => [r.out_org_id, r]))

  // Ordem de análise: segue orgIdsOrdered (ordem da tabela do admin) se
  // fornecido, senão usa a ordem original de orgIds.
  const analysisOrder = (orgIdsOrdered ?? orgIds).filter((id) => rowByOrgId[id])

  // Para cada org na ordem: busca previous_script_id e prepara o cache.
  // A primeira fica 'processing', as demais ficam 'queued'.
  type QueueItem = { orgScriptId: string; orgId: string; currentScriptId: string }
  const queue: QueueItem[] = []

  for (const orgId of analysisOrder) {
    const row = rowByOrgId[orgId]
    if (!row) continue
    const orgScriptId = row.out_id

    const { data: orgScriptRow } = await admin
      .from('org_scripts')
      .select('previous_script_id')
      .eq('id', orgScriptId)
      .maybeSingle()

    const currentScriptId = orgScriptRow?.previous_script_id as string | null | undefined
    if (!currentScriptId) {
      console.warn(`[send-script] org ${orgId} has no previous_script_id, skipping analysis`)
      continue
    }

    queue.push({ orgScriptId, orgId, currentScriptId })
  }

  const result: SendScriptResult = {
    scriptId,
    sentTo: orgIds.length,
    rows: rows.map((r) => ({
      id: r.out_id,
      orgId: r.out_org_id,
      scriptId: r.out_script_id,
      status: r.out_status,
      startedAt: r.out_started_at,
    })),
  }

  if (queue.length === 0) return result

  // Insere todas as linhas de cache: primeira como 'processing', demais como
  // 'queued'. Cada linha recebe um updated_at com 1ms de diferença para
  // preservar a ordem de inserção na query ORDER BY updated_at ASC do
  // process/route.ts.
  const baseTime = Date.now()
  for (let i = 0; i < queue.length; i++) {
    const { orgScriptId, orgId } = queue[i]
    await admin.from('script_intelligence_cache').upsert({
      org_id: orgId,
      org_script_id: orgScriptId,
      result: {},
      decisions: [],
      analysis_status: i === 0 ? 'processing' : 'queued',
      updated_at: new Date(baseTime + i).toISOString(),
    }, { onConflict: 'org_id,org_script_id' })
  }

  // Dispara apenas a primeira da fila em background.
  // O process/route.ts se encarrega de acionar a próxima quando terminar.
  const baseUrl = selfBaseUrl()
  const first = queue[0]
  void fetch(`${baseUrl}/api/script-intelligence/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
    },
    body: JSON.stringify({
      orgScriptId: first.orgScriptId,
      orgId: first.orgId,
      suggestedScriptId: scriptId,
      currentScriptId: first.currentScriptId,
    }),
  }).catch((err) => console.error('[send-script] background analysis dispatch failed:', err))

  return result
}
