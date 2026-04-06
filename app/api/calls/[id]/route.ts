import { type NextRequest } from 'next/server'
import { ok, unauthorized, forbidden, notFound } from '@/lib/auth'
import { getSession, getRole } from '@/lib/auth'
import { getCallById, updateCall, deleteCall } from '@/lib/services/calls'
import type { UpdateCallInput } from '@/lib/services/calls'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return unauthorized()

  const { id } = await params
  const call = await getCallById(id)
  if (!call) return notFound('Call')

  return ok(call)
}

export async function PUT(request: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role === 'trainer') return forbidden()

  const { id } = await params
  const body = await request.json() as UpdateCallInput

  const call = await updateCall(id, body)
  if (!call) return notFound('Call')

  return ok(call)
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role !== 'admin') return forbidden()

  const { id } = await params
  const existing = await getCallById(id)
  if (!existing) return notFound('Call')

  await deleteCall(id)
  return ok({ deleted: true })
}
