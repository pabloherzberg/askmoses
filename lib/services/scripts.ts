import { scripts, rubric } from '@/lib/mock-data'

export async function getScripts(filters?: { active?: boolean; rubricId?: string }) {
  let data = [...scripts]
  if (filters?.active) data = data.filter((s) => s.is_active)
  if (filters?.rubricId) data = data.filter((s) => s.rubric_id === filters.rubricId)
  return data
}

export async function getRubricConfig() {
  return rubric
}
