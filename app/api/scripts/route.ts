import { type NextRequest } from 'next/server'
import { forbidden, getOrgId, getRole, getSession, ok, requireOwnerWrite, unauthorized } from '@/lib/auth'
import { getScripts } from '@/lib/services/scripts'
import { dbCreateScript, type ScriptSection } from '@/lib/db/scripts'
import { dbGetRubricById } from '@/lib/db/rubric'

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

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const orgId = await getOrgId()
  if (!orgId) return forbidden()

  // Role guard: scripts são configuração de rubric — só owner/admin criam,
  // alinha com /api/rubric, /api/rubric/criteria, /api/calls. Trainer
  // não tem permissão de mexer em playbooks da org.
  const role = await getRole()
  if (role === 'trainer') return forbidden()

  try {
    const body = await request.json() as Record<string, unknown>

    // Cross-tenant guard: garante que rubric_id pertence à org da sessão
    // antes de criar o script. createAdminClient() bypassa RLS, então a
    // checagem aqui é a única defesa contra um owner apontar pra rubric
    // de outra org e quebrar isolamento de tenant.
    const rubricId = body.rubric_id as string | undefined
    if (!rubricId) {
      return Response.json(
        { data: null, error: { message: 'rubric_id is required', code: 400 } },
        { status: 400 },
      )
    }
    const rubric = await dbGetRubricById(orgId, rubricId)
    if (!rubric) return forbidden()

    const newScript = await dbCreateScript({
      orgId,
      rubricId,
      name: body.name as string,
      description: body.description as string | undefined,
      // ScriptSection includes optional weight + critical (gravados no JSONB).
      // O cast antigo apagava esses campos do TypeScript apesar deles
      // chegarem no body — corrige a "mentira" pra evitar perder dado em refactors futuros.
      sections: (body.sections as ScriptSection[]) ?? [],
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
