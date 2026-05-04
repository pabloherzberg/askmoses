import { getOrgId } from '@/lib/auth'

export async function getScripts(filters?: { active?: boolean; rubricId?: string; orgId?: string }) {
  const { dbGetScripts } = await import('@/lib/db/scripts')
  // Resolve orgId from the session if the caller didn't pass one — without
  // it we'd return scripts from every tenant. Returning `[]` when the
  // session has no org is intentional: no leakage on misconfigured users.
  const orgId = filters?.orgId ?? (await getOrgId())
  if (!orgId) return []
  return dbGetScripts({ orgId, rubricId: filters?.rubricId, active: filters?.active })
}
