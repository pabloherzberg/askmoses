import { type NextRequest } from 'next/server'
import { forbidden, getOrgId, getRole, getSession, ok, requireOwnerWrite, unauthorized } from '@/lib/auth'
import { getScripts } from '@/lib/services/scripts'
import { dbCreateScript, type ScriptSection } from '@/lib/db/scripts'
import { dbGetRubricById } from '@/lib/db/rubric'

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

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  // null = admin sem org → cria script global (org_id IS NULL)
  const orgId = await getOrgId()

  // Role guard: scripts são configuração de rubric — só owner/admin criam.
  // Trainer não tem permissão de mexer em playbooks da org.
  const role = await getRole()
  if (role === 'trainer') return forbidden()

  try {
    const body = await request.json() as Record<string, unknown>

    // Cross-tenant guard: garante que rubric_id pertence à org da sessão
    // (owner) ou à rubric global sem org (admin). createAdminClient() bypassa
    // RLS, então esta checagem é a única defesa contra tenant-hopping.
    const rubricId = body.rubric_id as string | undefined

    // Admin (orgId=null) pode criar scripts globais sem rubric_id.
    // Owner deve sempre fornecer rubric_id e o cross-tenant guard valida que
    // a rubric pertence à org da sessão.
    if (orgId !== null) {
      if (!rubricId) {
        return Response.json(
          { data: null, error: { message: 'rubric_id is required', code: 400 } },
          { status: 400 },
        )
      }
      const rubric = await dbGetRubricById(orgId, rubricId)
      if (!rubric) return forbidden()
    }

    const newScript = await dbCreateScript({
      orgId: orgId ?? undefined,
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
