export async function getScripts(filters?: { active?: boolean; rubricId?: string }) {
  const { dbGetScripts } = await import('@/lib/db/scripts')
  return dbGetScripts({ rubricId: filters?.rubricId, active: filters?.active })
}
