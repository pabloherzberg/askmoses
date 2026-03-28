import { type NextRequest } from 'next/server'
import { ok, unauthorized } from '@/lib/auth'
import { getSession } from '@/lib/auth'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()

  const { id } = await params
  const body = await request.json() as Record<string, unknown>
  // Fase 1 — mock update (não persiste)
  return ok({ id, ...body })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()

  const { id } = await params
  // Fase 1 — mock delete (não persiste)
  return ok({ id, deleted: true })
}
