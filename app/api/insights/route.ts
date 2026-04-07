import { type NextRequest } from 'next/server'
import { ok, unauthorized, forbidden } from '@/lib/auth'
import { getSession, getRole } from '@/lib/auth'
import { getInsights, generateInsights } from '@/lib/services/insights'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const data = await getInsights()
  return ok(data)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role === 'trainer') return forbidden()

  try {
    const body = await request.json() as { scriptId?: string }
    const data = await generateInsights(body.scriptId)
    return ok(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[insights] Error:', message)
    return Response.json({ data: null, error: { message, code: 500 } }, { status: 500 })
  }
}
