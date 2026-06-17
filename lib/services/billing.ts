import type { BillingCycle, BillingPeriodRange, BillingUsage } from "@/lib/types";

// Service da feature de Billing. Lazy-importa lib/db/billing.ts (que importa o
// admin client) só quando chamado, espelhando lib/services/clients.ts.

export async function getAdminUsage(range: BillingPeriodRange): Promise<BillingUsage> {
  const { dbGetAdminUsage } = await import("@/lib/db/billing");
  return dbGetAdminUsage(range);
}

export async function getOwnerUsage(
  orgId: string,
  range: BillingPeriodRange,
): Promise<BillingUsage> {
  const { dbGetOwnerUsage } = await import("@/lib/db/billing");
  return dbGetOwnerUsage(orgId, range);
}

export async function getAdminCycle(month: string): Promise<BillingCycle> {
  const { dbGetAdminCycle } = await import("@/lib/db/billing");
  return dbGetAdminCycle(month);
}

export async function getOwnerCycle(orgId: string, month: string): Promise<BillingCycle> {
  const { dbGetOwnerCycle } = await import("@/lib/db/billing");
  return dbGetOwnerCycle(orgId, month);
}
