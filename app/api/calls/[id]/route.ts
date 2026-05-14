import { type NextRequest } from 'next/server'
import { ok, unauthorized, forbidden, notFound } from '@/lib/auth'
import { getSession, getRole, getOrgId, getTrainerDbId, requireOwnerWrite } from '@/lib/auth'
import { getCallById, updateCall, deleteCall } from '@/lib/services/calls'
import type { UpdateCallInput } from '@/lib/services/calls'

type Params = { params: Promise<{ id: string }> }

async function callScopeForCurrentRole(): Promise<{ orgId?: string; trainerId?: string } | null> {
  const role = await getRole()
  if (role === 'trainer') {
    const trainerId = await getTrainerDbId()
    return trainerId ? { trainerId } : null
  }
  const orgId = await getOrgId()
  return orgId ? { orgId } : null
}

export async function GET(_request: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return unauthorized()

  const scope = await callScopeForCurrentRole()
  if (!scope) return notFound('Call')

  const { id } = await params
  const call = await getCallById(id, scope)
  if (!call) return notFound('Call')

  return ok(call)
}

export async function PUT(request: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return unauthorized()

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const role = await getRole()
  if (role === 'trainer') return forbidden()

  const orgId = await getOrgId()
  if (!orgId) return notFound('Call')

  const { id } = await params
  const body = await request.json() as UpdateCallInput
  // `updateCall` re-applies the orgId filter at the DB level (defense in depth)
  // so a stray future caller can't escape the tenant just by knowing the id.
  const call = await updateCall(id, body, { orgId })
  if (!call) return notFound('Call')

  return ok(call)
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return unauthorized()

  // Admin impersonando é read-only — bloqueia DELETE de call mesmo que o
  // Admin "real" tenha permissão. Admin operando do próprio painel (sem
  // impersonate) também não chega aqui pq não tem getOrgId() válido —
  // requireOwnerWrite só barra impersonate.
  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const role = await getRole()
  if (role !== 'admin') return forbidden()

  const orgId = await getOrgId()
  if (!orgId) return notFound('Call')

  const { id } = await params
  // Same defense-in-depth: the DELETE itself filters on org_id, so a missing
  // scope at the route level can't cascade into a cross-tenant delete.
  const deleted = await deleteCall(id, { orgId })
  if (!deleted) return notFound('Call')

  return ok({ deleted: true })
}
