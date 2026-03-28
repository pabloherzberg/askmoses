import { type NextRequest } from 'next/server'
import { ok, unauthorized } from '@/lib/auth'
import { getSession } from '@/lib/auth'
import { getScripts } from '@/lib/services/scripts'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const { searchParams } = request.nextUrl
  const active = searchParams.get('active') === 'true' ? true : undefined
  const rubricId = searchParams.get('rubricId') ?? undefined

  const data = await getScripts({ active, rubricId })
  return ok(data)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const body = await request.json() as Record<string, unknown>
  // Fase 1 — mock create (não persiste)
  const newScript = {
    id: `script-${Date.now()}`,
    created_at: new Date().toISOString(),
    is_active: true,
    rubric_id: 'rubric-001',
    ...body,
  }
  return ok(newScript)
}
