import { getMembershipsForSwitcher, getOrgId, ok, unauthorized, getSession } from '@/lib/auth'

// GET /api/me/memberships
//   Lista as orgs onde o caller tem membership aceita, anotando qual está
//   ativa. Usado pelo seletor de org no AppHeader (TC-06/07).
export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const [memberships, activeOrgId] = await Promise.all([
    getMembershipsForSwitcher(),
    getOrgId(),
  ])

  return ok({
    memberships,
    activeOrgId,
  })
}
