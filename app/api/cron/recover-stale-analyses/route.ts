import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dbHasPendingChunkWork } from '@/lib/db/call-chunks'
import { kickChunkWorker, triggerChunking } from '@/lib/services/chunk-pipeline'
import { selfBaseUrl } from '@/lib/internal-url'

// GET /api/cron/recover-stale-analyses
//
//   Safety net pro fluxo de Script Intelligence: o dispatch de análise via
//   /api/script-intelligence/process é fire-and-forget e pode ser cortado em
//   serverless (timeout de rede, crash). Quando isso acontece, a linha do
//   script_intelligence_cache fica em 'processing'/'queued' pra sempre.
//
//   Esta rota roda a cada 15 min (configurada em vercel.json):
//   - Para cada cache stale (> 15 min): se o org_scripts ainda está pending +
//     aberto, re-dispara a IA. Se está fechado, marca como 'error' (limpeza).
//   - Se pending não tem previous_script_id, marca como 'error' (sem base
//     pra comparação — não dá pra rodar análise).
//
//   Auth: header 'Authorization: Bearer $CRON_SECRET' (padrão Vercel Cron).

const STALE_THRESHOLD_MIN = 15
const BATCH_LIMIT = 50

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return Response.json({ error: 'forbidden' }, { status: 401 })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MIN * 60_000).toISOString()

  const { data: staleRows, error: staleErr } = await admin
    .from('script_intelligence_cache')
    .select('org_id, org_script_id, analysis_status, updated_at')
    .in('analysis_status', ['processing', 'queued'])
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (staleErr) {
    console.error('[cron/recover-stale-analyses] fetch stale failed:', staleErr)
    return Response.json({ error: 'failed to fetch stale rows' }, { status: 500 })
  }

  let recovered = 0
  let cleaned = 0
  let errored = 0

  for (const stale of staleRows ?? []) {
    try {
      const orgScriptId = stale.org_script_id as string
      const orgId = stale.org_id as string

      const { data: orgScript } = await admin
        .from('org_scripts')
        .select('id, script_id, previous_script_id, status, ended_at')
        .eq('id', orgScriptId)
        .maybeSingle()

      // Caso 2: org_scripts não existe, ou está fechado, ou não-pending.
      // Linha do cache é lixo órfão — marca como error pra parar de aparecer
      // no badge do admin.
      if (
        !orgScript ||
        orgScript.ended_at !== null ||
        orgScript.status !== 'pending'
      ) {
        await admin
          .from('script_intelligence_cache')
          .update({ analysis_status: 'error', updated_at: new Date().toISOString() })
          .eq('org_id', orgId)
          .eq('org_script_id', orgScriptId)
        cleaned += 1
        continue
      }

      const previousScriptId = orgScript.previous_script_id as string | null

      // Caso 3: pending válido mas sem previous_script_id — análise não tem
      // base de comparação. Marca como error (mesma semântica do skip em
      // send/route.ts:200-203).
      if (!previousScriptId) {
        await admin
          .from('script_intelligence_cache')
          .update({ analysis_status: 'error', updated_at: new Date().toISOString() })
          .eq('org_id', orgId)
          .eq('org_script_id', orgScriptId)
        errored += 1
        console.warn(`[cron/recover-stale-analyses] org ${orgId} pending without previous_script_id`)
        continue
      }

      // Caso 1: pending válido e ainda relevante — refresca updated_at pra sair
      // do critério de stale e re-dispara a análise.
      const suggestedScriptId = orgScript.script_id as string
      await admin
        .from('script_intelligence_cache')
        .update({ analysis_status: 'processing', updated_at: new Date().toISOString() })
        .eq('org_id', orgId)
        .eq('org_script_id', orgScriptId)

      const baseUrl = selfBaseUrl()
      void fetch(`${baseUrl}/api/script-intelligence/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
        },
        body: JSON.stringify({
          orgScriptId,
          orgId,
          suggestedScriptId,
          currentScriptId: previousScriptId,
        }),
      }).catch((err) =>
        console.error('[cron/recover-stale-analyses] dispatch failed:', err),
      )

      recovered += 1
    } catch (err) {
      console.error('[cron/recover-stale-analyses] row failed:', err)
      errored += 1
    }
  }

  // Rede de segurança da fila de chunks (077-080): a fila é auto-drenante por
  // eventos, mas se um elo da cadeia morreu, há chunks 'pending' parados sem
  // ninguém pra processá-los. Reusamos este cron (já agendado, sem custo de um
  // cron novo) só pra cutucar o worker quando há trabalho preso.
  let chunkWorkerKicked = false
  try {
    if (await dbHasPendingChunkWork()) {
      await kickChunkWorker()
      chunkWorkerKicked = true
    }
  } catch (err) {
    console.error('[cron/recover-stale-analyses] chunk safety-net falhou:', err)
  }

  // Safety-net pro handoff 'queued_for_chunking' → 'chunking'. O triggerChunking
  // é um self-fetch que pode se perder em serverless (a função do caller encerra
  // antes do request sair), deixando a call presa em 'queued_for_chunking' SEM
  // ninguém pra re-disparar — o kick do worker acima só cobre chunks já
  // enfileirados ('awaiting_chunks'). Aqui re-disparamos o chunk pras que
  // passaram do cutoff (15min). Re-trigger é seguro: nessas o chunk nunca rodou,
  // então o áudio original ainda está no Storage. Não tocamos em 'chunking'
  // (pode estar em andamento dentro dos 800s do maxDuration).
  let chunkingRetriggered = 0
  try {
    const { data: stuckQueued } = await admin
      .from('calls')
      .select('id')
      .eq('processing_status', 'queued_for_chunking')
      .lt('updated_at', cutoff)
      .order('updated_at', { ascending: true })
      .limit(BATCH_LIMIT)
    for (const row of stuckQueued ?? []) {
      await triggerChunking(row.id as string)
      chunkingRetriggered += 1
    }
  } catch (err) {
    console.error('[cron/recover-stale-analyses] re-trigger chunking falhou:', err)
  }

  return Response.json({
    recovered,
    cleaned,
    errored,
    scanned: staleRows?.length ?? 0,
    chunkWorkerKicked,
    chunkingRetriggered,
  })
}
