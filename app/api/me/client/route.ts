import { getOrgId, ok, unauthorized, notFound } from '@/lib/auth'
import { dbGetClientByOrgId } from '@/lib/db/clients'

/**
 * GET /api/me/client
 * Returns the Client (with embedded Plan) tied to the caller's org_id.
 * Any authenticated user with an org_id in their JWT can call this — used
 * by dashboard chrome to show the active plan and gate premium features.
 */
export async function GET() {
  const orgId = await getOrgId()
  if (!orgId) return unauthorized()

  const client = await dbGetClientByOrgId(orgId)
  if (!client) return notFound('Client')

  return ok(client)
}
