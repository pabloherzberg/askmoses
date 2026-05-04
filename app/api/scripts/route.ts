import { type NextRequest } from 'next/server'
import { forbidden, getOrgId, getSession, ok, unauthorized } from '@/lib/auth'
import { getScripts } from '@/lib/services/scripts'
import { dbCreateScript } from '@/lib/db/scripts'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  const orgId = await getOrgId()
  if (!orgId) return forbidden()

  const { searchParams } = request.nextUrl
  const active = searchParams.get('active') === 'true' ? true : undefined
  const rubricId = searchParams.get('rubricId') ?? undefined

  const data = await getScripts({ orgId, active, rubricId })
  return ok(data)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  const orgId = await getOrgId()
  if (!orgId) return forbidden()

  try {
    const body = await request.json() as Record<string, unknown>

    const newScript = await dbCreateScript({
      orgId,
      rubricId: body.rubric_id as string,
      name: body.name as string,
      description: body.description as string | undefined,
      sections: (body.sections as { name: string; instructions: string; tips: string }[]) ?? [],
      full_script: body.full_script as string | undefined,
      criteria: (body.criteria as { name: string; description: string }[]) ?? [],
      isActive: body.is_active as boolean | undefined,
    })

    return ok(newScript)
  } catch (e) {
    console.error('[scripts] dbCreateScript failed:', e instanceof Error ? e.message : e)
    return Response.json(
      { data: null, error: { message: 'Failed to create script', code: 500 } },
      { status: 500 },
    )
  }
}
