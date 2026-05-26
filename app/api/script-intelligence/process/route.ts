import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runScriptIntelligence } from '@/lib/script-intelligence/analyze'

// POST /api/script-intelligence/process
// Rota interna — chamada pelo admin/send após criar o pending.
// Roda a IA, salva no cache com analysis_status=ready (ou error).
// Ao terminar, verifica se há próxima org 'queued' para o mesmo script
// e dispara sequencialmente.
// Protegida por secret interno para não ser chamada por usuários externos.
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await request.json() as {
    orgScriptId: string
    orgId: string
    suggestedScriptId: string
    currentScriptId: string
  }

  const { orgScriptId, orgId, suggestedScriptId, currentScriptId } = body

  if (!orgScriptId || !orgId || !suggestedScriptId || !currentScriptId) {
    return Response.json({ error: 'missing params' }, { status: 400 })
  }

  const admin = createAdminClient()

  const analysis = await runScriptIntelligence(currentScriptId, suggestedScriptId, orgId)

  const finalStatus = analysis.ok ? 'ready' : 'error'
  const finalResult = analysis.ok ? analysis.result : {}

  await admin.from('script_intelligence_cache').upsert({
    org_id: orgId,
    org_script_id: orgScriptId,
    result: finalResult,
    decisions: [],
    analysis_status: finalStatus,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'org_id,org_script_id' })

  if (!analysis.ok) {
    console.error('[sic/process] analysis failed:', analysis.error)
  }

  // Busca a próxima org 'queued' para o mesmo script sugerido.
  // Ordena por updated_at ASC — o send/route.ts insere com 1ms de diferença
  // por org, garantindo que a ordem do cache = ordem da tabela do admin.
  const { data: queuedRows } = await admin
    .from('script_intelligence_cache')
    .select('org_script_id, org_id')
    .eq('analysis_status', 'queued')
    .order('updated_at', { ascending: true })
    .limit(50)

  if (!queuedRows || queuedRows.length === 0) {
    return Response.json({ ok: true, queued: 0 })
  }

  // Filtra apenas as que pertencem ao mesmo script sugerido, preservando a
  // ordem do cache (updated_at ASC = ordem da tabela do admin).
  type OrgScriptMatch = { id: string; org_id: string; previous_script_id: string | null }
  type CacheRow = { org_script_id: string; org_id: string }

  const orgScriptIds = (queuedRows as CacheRow[]).map((r) => r.org_script_id)
  const { data: orgScriptRows } = await admin
    .from('org_scripts')
    .select('id, org_id, previous_script_id')
    .in('id', orgScriptIds)
    .eq('script_id', suggestedScriptId)

  if (!orgScriptRows || orgScriptRows.length === 0) {
    return Response.json({ ok: true, queued: 0 })
  }

  // Indexa os org_script rows por id para lookup O(1)
  const orgScriptById = Object.fromEntries(
    (orgScriptRows as OrgScriptMatch[]).map((r) => [r.id, r])
  )

  // Percorre o cache na ordem correta (updated_at ASC) e pega o primeiro
  // que pertence ao mesmo suggestedScriptId
  let nextMatch: OrgScriptMatch | null = null
  for (const cacheRow of queuedRows as CacheRow[]) {
    const match = orgScriptById[cacheRow.org_script_id]
    if (match) {
      nextMatch = match
      break
    }
  }

  if (!nextMatch || !nextMatch.previous_script_id) {
    if (nextMatch) {
      await admin.from('script_intelligence_cache').update({
        analysis_status: 'error',
        updated_at: new Date().toISOString(),
      }).eq('org_script_id', nextMatch.id)
      console.warn(`[sic/process] next org ${nextMatch.org_id} has no previous_script_id, skipping`)
    }
    return Response.json({ ok: true, queued: orgScriptRows.length })
  }

  // Marca a próxima como 'processing'
  await admin.from('script_intelligence_cache').update({
    analysis_status: 'processing',
    updated_at: new Date().toISOString(),
  }).eq('org_script_id', nextMatch.id)

  // Dispara a análise da próxima em background
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  void fetch(`${baseUrl}/api/script-intelligence/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
    },
    body: JSON.stringify({
      orgScriptId: nextMatch.id,
      orgId: nextMatch.org_id,
      suggestedScriptId,
      currentScriptId: nextMatch.previous_script_id,
    }),
  }).catch((err) => console.error('[sic/process] next dispatch failed:', err))

  return Response.json({ ok: true, queued: orgScriptRows.length - 1 })
}
