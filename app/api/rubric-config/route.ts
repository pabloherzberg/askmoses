import { type NextRequest } from 'next/server'
import { ok, unauthorized } from '@/lib/auth'
import { getSession } from '@/lib/auth'
import { getRubricConfig } from '@/lib/services/scripts'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const data = await getRubricConfig()
  return ok(data)
}

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const body = await request.json() as Record<string, unknown>
  const current = await getRubricConfig()
  // Fase 1 — mock update (não persiste)
  return ok({ ...current, ...body })
}
