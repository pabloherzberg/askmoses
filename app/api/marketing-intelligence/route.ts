import { forbidden, getActiveOrgContext, getSession, ok, unauthorized } from '@/lib/auth'
import { getOrRunLatest, NoClosedCallsError } from '@/lib/services/marketing-intelligence'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const ctx = await getActiveOrgContext()
  if (!ctx) return forbidden()

  // Only owner/admin see Marketing Intelligence. Trainer is blocked at the
  // middleware layer too; this is defense in depth for the API surface.
  if (ctx.role !== 'owner' && ctx.role !== 'admin') return forbidden()
  if (!ctx.activeOrgId) return forbidden()

  try {
    const data = await getOrRunLatest(ctx.activeOrgId, session.user.id)
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
    console.error('[marketing-intelligence] GET failed:', message)
    return Response.json(
      {
        data: null,
        error: {
          message: 'Marketing Intelligence is temporarily unavailable.',
          code: 500,
          reason: 'INTERNAL_ERROR',
        },
      },
      { status: 500 },
    )
  }
}
