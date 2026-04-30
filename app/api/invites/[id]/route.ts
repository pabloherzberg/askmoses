import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden, notFound } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(message: string) {
  return Response.json({ data: null, error: { message, code: 400 } }, { status: 400 })
}

function conflict(message: string) {
  return Response.json({ data: null, error: { message, code: 409 } }, { status: 409 })
}

function serverError(context: string, err?: unknown) {
  console.error(`[invites] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 }
  )
}

// DELETE /api/invites/[id] — revoga um convite pendente
//   Owner: pode revogar convite da própria org
//   Admin: pode revogar qualquer convite
//   Trainer: 403
//   Apenas convites com invite_status='pending' são removíveis aqui.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id || !UUID_RE.test(id)) return badRequest('Identificador inválido')

  const session = await getSession()
  if (!session) return unauthorized()

  const callerRole = session.user.app_metadata?.role as Role | undefined
  const callerOrgId = session.user.app_metadata?.org_id as string | undefined

  if (callerRole !== 'owner' && callerRole !== 'admin') return forbidden()

  const admin = createAdminClient()

  // ─── Busca o alvo ────────────────────────────────────────────────────────
  const { data: target, error: targetErr } = await admin
    .from('users')
    .select('id, role, org_id, invite_status')
    .eq('id', id)
    .maybeSingle()

  if (targetErr) return serverError('Não foi possível localizar o convite', targetErr)
  if (!target) return notFound('Convite')

  // ─── Escopo: owner só pode revogar dentro da própria org ─────────────────
  if (callerRole === 'owner') {
    if (!callerOrgId) {
      return serverError('Não foi possível identificar a organização do solicitante')
    }
    if (target.org_id !== callerOrgId) {
      // Não revelar se existe ou se é cross-tenant — comportamento idêntico
      return notFound('Convite')
    }
    // Owner não pode revogar convite de outro owner (defesa-em-profundidade
    // contra escalada caso algum convite tenha role='owner' na própria org)
    if (target.role !== 'trainer') return forbidden()
  }

  // ─── Só revoga se ainda estiver pendente ─────────────────────────────────
  if (target.invite_status !== 'pending') {
    return conflict('Este convite não pode ser revogado')
  }

  // ─── 1. Mata a credencial PRIMEIRO ───────────────────────────────────────
  // Deletando auth.users invalida o token do magic link imediatamente. Se
  // qualquer passo seguinte falhar, ao menos o convidado não consegue entrar.
  const { error: authErr } = await admin.auth.admin.deleteUser(id)
  if (authErr) return serverError('Não foi possível revogar o convite', authErr)

  // ─── 2. Limpa registros da aplicação ─────────────────────────────────────
  // A partir daqui, mesmo se algo falhar, o link já está morto.
  if (target.role === 'trainer') {
    const { error: trainerErr } = await admin.from('trainers').delete().eq('user_id', id)
    if (trainerErr) console.error('[invites] Limpeza pós-revogação incompleta')
  } else if (target.role === 'owner') {
    const { error: ownerErr } = await admin.from('owners').delete().eq('user_id', id)
    if (ownerErr) console.error('[invites] Limpeza pós-revogação incompleta')
  }

  const { error: usersErr } = await admin.from('users').delete().eq('id', id)
  if (usersErr) console.error('[invites] Limpeza pós-revogação incompleta')

  return ok({ id, revoked: true })
}
