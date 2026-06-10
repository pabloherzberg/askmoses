import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { selfBaseUrl } from '@/lib/internal-url'
import type { Role } from '@/lib/types'

interface RetryBody {
  orgId?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(message: string) {
  return Response.json(
    { data: null, error: { message, code: 400 } },
    { status: 400 },
  )
}

function notFound(message: string) {
  return Response.json(
    { data: null, error: { message, code: 404 } },
    { status: 404 },
  )
}

function unprocessable(message: string) {
  return Response.json(
    { data: null, error: { message, code: 422 } },
    { status: 422 },
  )
}

function serverError(context: string, err?: unknown) {
  console.error(`[admin/scripts/retry-analysis] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 },
  )
}

// POST /api/admin/scripts/retry-analysis
//
//   Re-dispara a análise IA pro pending atual de uma org. Útil quando o cache
//   ficou travado em 'processing'/'queued' por falha no dispatch fire-and-forget
//   (timeout de rede, crash de invocação serverless, etc) — diferente do
//   send/route.ts, NÃO recria o org_scripts: o pending existente é mantido,
//   só atualiza o cache e re-dispara o /api/script-intelligence/process.
//
//   Admin only.
export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  let body: RetryBody
  try {
    body = (await request.json()) as RetryBody
  } catch {
    return badRequest('Body inválido')
  }

  const { orgId } = body
  if (!orgId || typeof orgId !== 'string' || !UUID_RE.test(orgId)) {
    return badRequest('orgId inválido')
  }

  const admin = createAdminClient()

  // Pending atual da org. Partial unique uniq_org_scripts_open_per_org garante
  // no máximo 1 linha aberta por org, mas ordenamos por started_at DESC pra
  // ficar defensivo contra estados inconsistentes.
  const { data: pending, error: pendingErr } = await admin
    .from('org_scripts')
    .select('id, script_id, previous_script_id')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pendingErr) return serverError('Falha ao buscar pending', pendingErr)
  if (!pending) return notFound('Nenhum pending para reanalisar')

  const orgScriptId = pending.id as string
  const suggestedScriptId = pending.script_id as string
  const previousScriptId = pending.previous_script_id as string | null

  // Mesma constraint que send/route.ts impõe: sem script anterior, não há
  // base de comparação pra análise IA rodar (lib/script-intelligence/analyze.ts
  // exige currentScriptId).
  if (!previousScriptId) {
    return unprocessable('Org não tem script anterior — nada para comparar')
  }

  // UPSERT cache em 'processing' com updated_at novo. Mantém result/decisions
  // zerados — equivalente ao tratamento de primeira inserção em send/route.ts.
  const { error: cacheErr } = await admin
    .from('script_intelligence_cache')
    .upsert(
      {
        org_id: orgId,
        org_script_id: orgScriptId,
        result: {},
        decisions: [],
        analysis_status: 'processing',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,org_script_id' },
    )

  if (cacheErr) return serverError('Falha ao atualizar cache', cacheErr)

  // Dispatch fire-and-forget — mesmo padrão de send/route.ts. Em serverless
  // o request pode ser cortado se a função retornar antes do socket sair,
  // por isso o cron da parte C é o safety net.
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
  }).catch((err) => console.error('[admin/scripts/retry-analysis] dispatch failed:', err))

  return ok({ orgScriptId, status: 'processing' })
}
