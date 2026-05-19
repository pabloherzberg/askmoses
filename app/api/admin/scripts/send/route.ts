import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimitDb, rateLimitedResponse } from '@/lib/auth/rate-limit'
import { requireSameOrigin } from '@/lib/auth/csrf'
import type { Role } from '@/lib/types'

// 30 sends/admin/min — bulk sends pra dezenas de orgs em sequência são
// previstos durante release de nova versão, então o teto fica mais alto
// do que outros endpoints admin.
const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_SECONDS = 60

interface SendBody {
  scriptId?: string
  orgIds?: string[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(message: string) {
  return Response.json(
    { data: null, error: { message, code: 400 } },
    { status: 400 },
  )
}

function serverError(context: string, err?: unknown) {
  console.error(`[admin/scripts/send] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 },
  )
}

// POST /api/admin/scripts/send
//   Body: { scriptId, orgIds: string[] }
//
//   Cria/atualiza linhas em org_scripts pra enviar o script a uma ou mais
//   orgs. Cada org recebe status='pending'. Quando o Owner aceitar (fluxo
//   futuro), vira 'active'. Linhas 'active' anteriores da mesma org são
//   encerradas (status='active', ended_at=now() — mas 'deprecated' é
//   derivado em SELECT, ver migration 044).
//
//   Idempotência: UNIQUE (org_id, script_id) garante que reenviar o mesmo
//   script pra mesma org é UPSERT — atualiza status=pending e renova
//   started_at/sent_by/ended_at=null.
//
//   Admin only.
export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  const rl = await checkRateLimitDb(
    `script_send:${session.user.id}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_SECONDS,
  )
  if (!rl.allowed) return rateLimitedResponse(rl)

  let body: SendBody
  try {
    body = (await request.json()) as SendBody
  } catch {
    return badRequest('Body inválido')
  }

  const { scriptId, orgIds } = body

  if (!scriptId || !UUID_RE.test(scriptId)) return badRequest('scriptId inválido')
  if (!Array.isArray(orgIds) || orgIds.length === 0) {
    return badRequest('orgIds precisa ser um array com pelo menos 1 elemento')
  }
  if (orgIds.length > 100) {
    return badRequest('Máximo de 100 orgs por send')
  }
  for (const id of orgIds) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      return badRequest('Algum orgId é inválido')
    }
  }

  const admin = createAdminClient()

  // Valida script existe e é template — Admin não deve poder enviar scripts
  // locais de uma org pra outras (vazamento de dados).
  const { data: script, error: scriptErr } = await admin
    .from('scripts')
    .select('id, is_template')
    .eq('id', scriptId)
    .maybeSingle()
  if (scriptErr) return serverError('Não foi possível validar o script', scriptErr)
  if (!script) return badRequest('Script não encontrado')
  if (!script.is_template) return badRequest('Apenas scripts do catálogo podem ser enviados')

  // Encerra qualquer linha 'active' anterior das orgs alvo (mesmo script ou
  // não). started_at do novo registro = now; o anterior fica como histórico
  // com ended_at=now. Necessário pra UI: a row corrente da org é a mais
  // recente; as antigas viram parte do histórico via started_at desc.
  const now = new Date().toISOString()
  const { error: closeErr } = await admin
    .from('org_scripts')
    .update({ ended_at: now })
    .in('org_id', orgIds)
    .eq('status', 'active')
    .is('ended_at', null)
  if (closeErr) return serverError('Não foi possível encerrar associações ativas', closeErr)

  // UPSERT por (org_id, script_id) — se já existe linha pra essa combinação,
  // reseta pra pending e renova started_at/sent_by.
  const rows = orgIds.map((orgId) => ({
    org_id: orgId,
    script_id: scriptId,
    status: 'pending' as const,
    started_at: now,
    ended_at: null,
    sent_by: session.user.id,
  }))

  const { data: upserted, error: upsertErr } = await admin
    .from('org_scripts')
    .upsert(rows, { onConflict: 'org_id,script_id' })
    .select('id, org_id, script_id, status, started_at')

  if (upsertErr) return serverError('Não foi possível registrar o envio', upsertErr)

  return ok({
    scriptId,
    sentTo: orgIds.length,
    rows: (upserted ?? []).map((r) => ({
      id: r.id,
      orgId: r.org_id,
      scriptId: r.script_id,
      status: r.status,
      startedAt: r.started_at,
    })),
  })
}
