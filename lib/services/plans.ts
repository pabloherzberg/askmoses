import type { Plan, PlanCode, Client } from '@/lib/types'

const USE_MOCK = process.env.USE_MOCK_DATA !== 'false'

export async function getPlans(): Promise<Plan[]> {
  if (USE_MOCK) {
    const { plans } = await import('@/lib/mock-data')
    return plans
  }
  const { dbGetPlans } = await import('@/lib/db/plans')
  return dbGetPlans()
}

export async function getPlanById(id: string): Promise<Plan | null> {
  if (USE_MOCK) {
    const { plans } = await import('@/lib/mock-data')
    return plans.find((p) => p.id === id) ?? null
  }
  const { dbGetPlanById } = await import('@/lib/db/plans')
  return dbGetPlanById(id)
}

export async function getPlanByCode(code: PlanCode): Promise<Plan | null> {
  if (USE_MOCK) {
    const { plans } = await import('@/lib/mock-data')
    return plans.find((p) => p.code === code) ?? null
  }
  const { dbGetPlanByCode } = await import('@/lib/db/plans')
  return dbGetPlanByCode(code)
}

// ─── Feature flag helpers ────────────────────────────────────────────────────

export function canRag(client: Pick<Client, 'plan'>): boolean {
  return client.plan.hasRag
}

export function canTwilio(client: Pick<Client, 'plan'>): boolean {
  return client.plan.hasTwilio
}

export function canManualUpload(client: Pick<Client, 'plan'>): boolean {
  return client.plan.hasManualUpload
}
