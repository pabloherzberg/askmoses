import { type NextRequest } from 'next/server'
import { getActiveOrgContext, getSession, ok, unauthorized, forbidden, notFound } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(message: string) {
  return Response.json({ data: null, error: { message, code: 400 } }, { status: 400 })
}

function serverError(context: string, err?: unknown) {
  console.error(`[invites] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 }
  )
}

// DELETE /api/invites/[id]?orgId=<uuid>
//   Owner: revoga convite pendente da própria org ATIVA (current_org).
//          orgId no query é ignorado — o escopo é sempre o active_org.
//          Não pode revogar invite de outro owner.
//   Admin: orgId é OBRIGATÓRIO no querystring — em multi-org o mesmo user_id
//          pode ter pendências em N orgs. Sem orgId, .maybeSingle() falharia.
//   Trainer: 403.
//
// [id] é o user_id do convidado. A membership pendente daquele user no
// (user_id, org_id) escopo é o que sai. Auth user só é deletado se o user
// ficar sem nenhuma membership (caso típico de invite recém-criado).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id || !UUID_RE.test(id)) return badRequest('Identificador inválido')

  const session = await getSession()
  if (!session) return unauthorized()

  const callerRole = session.user.app_metadata?.role as Role | undefined
  if (callerRole !== 'owner' && callerRole !== 'admin') return forbidden()

  const admin = createAdminClient()

  // ─── Resolve escopo do caller ────────────────────────────────────────────
  let scopedOrgId: string
  if (callerRole === 'owner') {
    // Owner: escopo lido do users.active_org_id (não do JWT, deprecated).
    const ctx = await getActiveOrgContext()
    if (!ctx?.activeOrgId) {
      return serverError('Não foi possível identificar a organização do solicitante')
    }
    scopedOrgId = ctx.activeOrgId
  } else {
    // Admin: orgId é obrigatório no querystring pra desambiguar em multi-org.
    const orgIdParam = request.nextUrl.searchParams.get('orgId')
    if (!orgIdParam || !UUID_RE.test(orgIdParam)) {
      return badRequest('orgId é obrigatório no querystring quando admin revoga')
    }
    scopedOrgId = orgIdParam
  }

  // ─── Busca a membership pendente do alvo no escopo (sempre filtrada) ─────
  const { data: pending, error: memErr } = await admin
    .from('memberships')
    .select('user_id, org_id, role, invite_status')
    .eq('user_id', id)
    .eq('org_id', scopedOrgId)
    .eq('invite_status', 'pending')
    .maybeSingle()
  if (memErr) return serverError('Não foi possível localizar o convite', memErr)
  if (!pending) {
    // Não revela cross-tenant, não revela se já foi aceito — sempre 404 genérico
    return notFound('Convite')
  }

  // Owner não revoga convite de outro owner (defesa-em-profundidade).
  if (callerRole === 'owner' && pending.role !== 'trainer') return forbidden()

  // ─── 1. Deleta trainers/owners row do escopo ─────────────────────────────
  // Antes da membership pra evitar que listas operacionais leiam um trainer/
  // owner sem membership correspondente entre os dois deletes.
  if (pending.role === 'trainer') {
    const { error } = await admin
      .from('trainers')
      .delete()
      .eq('user_id', id)
      .eq('org_id', pending.org_id)
    if (error) console.error('[invites] cleanup trainer falhou', error)
  } else {
    const { error } = await admin
      .from('owners')
      .delete()
      .eq('user_id', id)
      .eq('org_id', pending.org_id)
    if (error) console.error('[invites] cleanup owner falhou', error)
  }

  // ─── 2. Deleta a membership ──────────────────────────────────────────────
  const { error: delMemErr } = await admin
    .from('memberships')
    .delete()
    .eq('user_id', id)
    .eq('org_id', pending.org_id)
  if (delMemErr) return serverError('Não foi possível revogar o convite', delMemErr)

  // ─── 3. Se ficou sem nenhuma membership, era um invitee novo — full delete ─
  // Auth user dele foi criado especificamente pra esse convite (Branch B do
  // POST). Sem nenhuma outra membership, o auth user não tem propósito —
  // matá-lo invalida o magic link e libera o email pra novos convites.
  // Se o user tem outras memberships (multi-org), preserva o auth user.
  const { count: remaining, error: countErr } = await admin
    .from('memberships')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', id)

  if (countErr) {
    console.error('[invites] count remaining memberships falhou', countErr)
  } else if ((remaining ?? 0) === 0) {
    const { error: usersErr } = await admin.from('users').delete().eq('id', id)
    if (usersErr) console.error('[invites] cleanup users falhou', usersErr)
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }

  return ok({ id, revoked: true, orgId: pending.org_id })
}
