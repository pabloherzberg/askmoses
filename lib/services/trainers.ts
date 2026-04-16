import type { Trainer, PerformanceTrendPoint } from "@/lib/types";

const USE_MOCK = process.env.USE_MOCK_DATA !== "false";
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

// Maps mock trend data to real trainer IDs using demo email convention.
// trainer@demo → Marcus, trainer2@demo → Jamie, trainer3@demo → Jordan, trainer4@demo → Taylor
const EMAIL_TO_MOCK_KEY: Record<string, string> = {
  "trainer@demo.askmoses.ai":  "00000000-0000-0000-0000-000000000301",
  "trainer2@demo.askmoses.ai": "00000000-0000-0000-0000-000000000302",
  "trainer3@demo.askmoses.ai": "00000000-0000-0000-0000-000000000303",
  "trainer4@demo.askmoses.ai": "00000000-0000-0000-0000-000000000304",
}

export async function getPerformanceTrends(
  realTrainers: { id: string; email?: string }[]
): Promise<Record<string, PerformanceTrendPoint[]>> {
  if (USE_MOCK) {
    const { performanceTrends } = await import("@/lib/mock-data");
    const remapped: Record<string, PerformanceTrendPoint[]> = { team: performanceTrends.team }
    for (const trainer of realTrainers) {
      const mockKey = trainer.email ? EMAIL_TO_MOCK_KEY[trainer.email] : undefined
      if (mockKey && performanceTrends[mockKey]) {
        remapped[trainer.id] = performanceTrends[mockKey]
      }
    }
    return remapped;
  }
  return {};
}
