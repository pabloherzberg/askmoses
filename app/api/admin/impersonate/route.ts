import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

interface StartBody {
  orgId?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(message: string) {
  return Response.json(
    { data: null, error: { message, code: 400 } },
    { status: 400 }
  )
}

function notFound(message: string) {
  return Response.json(
    { data: null, error: { message, code: 404 } },
    { status: 404 }
  )
}

function serverError(context: string, err?: unknown) {
  console.error(`[admin/impersonate] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 }
  )
}

// POST /api/admin/impersonate
//   Body: { orgId: uuid }
//   Inicia sessão de impersonate read-only do Admin numa org. Seta JWT
//   claim app_metadata.impersonating_org_id — current_org() (migration 040)
//   lê esse claim pra Admin acessar dados via SELECT policies. Writes
//   continuam bloqueados por requireOwnerWrite() no API + current_org_for_write()
//   no DB.
//
//   Audit: insere row em admin_impersonations. Sessão fica "aberta"
//   (ended_at=NULL) até DELETE explicito ou job de cleanup.
//
//   Cliente DEVE chamar supabase.auth.refreshSession() após receber 200
//   pra pegar o JWT novo — sem isso, current_org() ainda retorna NULL na
//   próxima request.
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  let body: StartBody
  try {
    body = (await request.json()) as StartBody
  } catch {
    return badRequest('Body inválido')
  }

  const orgId = body.orgId?.trim()
  if (!orgId || !UUID_RE.test(orgId)) return badRequest('orgId inválido')

  const admin = createAdminClient()

  // Valida que a org existe — sem isso, Admin podia setar um claim com UUID
  // aleatório e current_org() retornaria a string sem nada pra match (zero
  // dado, mas confuso). 404 explícito é melhor sinal.
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle()
  if (orgErr) return serverError('Não foi possível validar a organização', orgErr)
  if (!org) return notFound('Organização não encontrada')

  // Audit row primeiro — se a atualização do JWT falhar depois, sobrar uma
  // row "started" com ended_at=NULL é menos ruim que ter o claim setado sem
  // registro de audit. Job de cleanup eventualmente fecha sessões órfãs.
  const { data: audit, error: auditErr } = await admin
    .from('admin_impersonations')
    .insert({
      admin_user_id: session.user.id,
      target_org_id: orgId,
    })
    .select('id')
    .single()
  if (auditErr || !audit) return serverError('Não foi possível registrar audit', auditErr)

  // Preserva resto do app_metadata (role, possíveis flags futuras).
  const currentMeta = (session.user.app_metadata ?? {}) as Record<string, unknown>
  const { error: metaErr } = await admin.auth.admin.updateUserById(session.user.id, {
    app_metadata: { ...currentMeta, impersonating_org_id: orgId },
  })
  if (metaErr) {
    // Rollback do audit pra não ficar com row "aberta" que nunca de fato existiu.
    await admin.from('admin_impersonations').delete().eq('id', audit.id)
    return serverError('Não foi possível iniciar impersonate', metaErr)
  }

  return ok({
    orgId: org.id,
    orgName: org.name,
    audit_id: audit.id,
  })
}

// DELETE /api/admin/impersonate
//   Encerra a sessão de impersonate ativa do Admin. Remove o claim
//   app_metadata.impersonating_org_id e fecha a row de audit (ended_at).
//
//   Idempotente: chamar sem estar impersonando retorna 200 com noOp=true.
//   Cliente DEVE chamar supabase.auth.refreshSession() após receber 200.
export async function DELETE() {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  const currentMeta = (session.user.app_metadata ?? {}) as Record<string, unknown>
  const impersonatingOrgId = typeof currentMeta.impersonating_org_id === 'string'
    ? currentMeta.impersonating_org_id
    : null

  if (!impersonatingOrgId) {
    // Idempotente: sem impersonate ativo, no-op. Frontend pode chamar isso
    // defensivamente no logout sem precisar checar estado primeiro.
    return ok({ noOp: true })
  }

  const admin = createAdminClient()

  // Fecha a row de audit (mais recente ainda aberta dessa dupla).
  const { error: closeErr } = await admin.rpc('close_admin_impersonation', {
    p_admin_user_id: session.user.id,
    p_target_org_id: impersonatingOrgId,
  })
  if (closeErr) {
    console.warn('[admin/impersonate] close_admin_impersonation falhou — prosseguindo com clear do JWT', closeErr)
    // Não bloqueia: limpar o claim é mais crítico que fechar o audit row.
    // Job de cleanup fecha sessões órfãs.
  }

  // Supabase faz merge (não replace) em app_metadata via updateUserById —
  // omitir a chave não limpa o valor anterior. Setar explicitamente null
  // força o clear. Mantemos role + qualquer outro flag intacto via spread.
  const { impersonating_org_id: _dropped, ...metaWithoutImpersonate } = currentMeta
  const { error: metaErr } = await admin.auth.admin.updateUserById(session.user.id, {
    app_metadata: { ...metaWithoutImpersonate, impersonating_org_id: null },
  })
  if (metaErr) return serverError('Não foi possível encerrar impersonate', metaErr)

  return ok({ noOp: false })
}
