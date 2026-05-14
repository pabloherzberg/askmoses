import { forbidden, getActiveOrgContext, getSession, ok, unauthorized } from '@/lib/auth'
import { executeMarketingRun, NoClosedCallsError } from '@/lib/services/marketing-intelligence'

// POST /api/marketing-intelligence/run
//   RUN NOW — restricted to AskMoses super-admins (TC-09). Owners read the
//   latest cached run via GET /api/marketing-intelligence; only admin can
//   force a fresh LLM execution.
export async function POST() {
  const session = await getSession()
  if (!session) return unauthorized()

  // Super-admin check is on the JWT (app_metadata.role === 'admin'), not the
  // org-context role — owners of an org never satisfy this.
  const isSuperAdmin = session.user.app_metadata?.role === 'admin'
  if (!isSuperAdmin) return forbidden()

  const ctx = await getActiveOrgContext()
  if (!ctx?.activeOrgId) return forbidden()

  try {
    const data = await executeMarketingRun({
      orgId: ctx.activeOrgId,
      trigger: 'manual',
      createdBy: session.user.id,
    })
    return ok(data)
  } catch (err) {
    if (err instanceof NoClosedCallsError) {
      return Response.json(
        {
          data: null,
          error: {
            message: err.message,
            code: 422,
            reason: 'NO_CLOSED_CALLS',
          },
        },
        { status: 422 },
      )
    }
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('[marketing-intelligence/run] POST failed:', message)
    return Response.json(
      { data: null, error: { message: 'Failed to run Marketing Intelligence analysis.', code: 500 } },
      { status: 500 },
    )
  }
}
