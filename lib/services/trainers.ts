import type { Trainer } from "@/lib/types";
import { getOrgId } from "@/lib/auth";

export async function getTrainers(): Promise<Trainer[]> {
  const { dbGetTrainers } = await import("@/lib/db/trainers");
  const orgId = await getOrgId();
  return orgId ? dbGetTrainers({ orgId }) : [];
}

export async function getTrainerById(id: string): Promise<Trainer | null> {
  const { dbGetTrainerById } = await import("@/lib/db/trainers");
  return dbGetTrainerById(id);
}
